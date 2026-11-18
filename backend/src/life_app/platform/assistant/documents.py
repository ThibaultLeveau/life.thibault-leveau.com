"""Bounded, isolated readers for explicitly imported assistant documents."""

import io
import json
import logging
import re
import subprocess
import sys
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024
MAX_SOURCES = 4
MAX_PDF_PAGES = 50
MAX_TEXT_CHARS = 120_000
MAX_IMAGE_DIMENSION = 8000
MAX_IMAGE_PIXELS = 40_000_000
MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
MAX_XML_BYTES = 4 * 1024 * 1024
FORMATS = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


class DocumentError(Exception):
    def __init__(self, code="source_invalid_file"):
        self.code = code
        super().__init__(code)


@dataclass
class ParsedDocument:
    name: str
    media_type: str
    text: str | None = None
    page_count: int | None = None


def safe_name(value):
    name = str(value).replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(c for c in name if not unicodedata.category(c).startswith("C"))
    name = name.strip()
    if len(name) > 200:
        extension = PurePosixPath(name).suffix[:12]
        name = name[: 200 - len(extension)] + extension
    return name or "document"


def bounded_text(value):
    if len(value) > MAX_TEXT_CHARS:
        raise DocumentError("source_text_too_large")
    if "\x00" in value:
        raise DocumentError("source_invalid_file")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise DocumentError("source_invalid_file") from None
    value = value.strip()
    if not value:
        raise DocumentError("source_no_text")
    return value


def text_file(data):
    try:
        if data.startswith((b"\xff\xfe", b"\xfe\xff")):
            value = data.decode("utf-16")
        else:
            value = data.decode("utf-8-sig")
    except UnicodeError:
        raise DocumentError("source_text_encoding") from None
    if "\x00" in value or any(ord(c) < 32 and c not in "\n\r\t" for c in value):
        raise DocumentError("source_invalid_file")
    return bounded_text(value)


def _xml(archive, name):
    from defusedxml.ElementTree import fromstring

    content = archive.read(name)
    if len(content) > MAX_XML_BYTES:
        raise DocumentError("source_archive_too_large")
    return fromstring(content)


def _local(element):
    return element.tag.rsplit("}", 1)[-1]


def _texts(element):
    return "".join(node.text or "" for node in element.iter() if _local(node) == "t")


RELATIONSHIP_NAMESPACES = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "http://purl.oclc.org/ooxml/officeDocument/relationships",
)


def _relationships(archive, part):
    path = PurePosixPath(part)
    root = _xml(archive, str(path.parent / "_rels" / (path.name + ".rels")))
    if _local(root) != "Relationships":
        raise DocumentError()
    result = {}
    for node in root:
        identifier = node.get("Id")
        if _local(node) != "Relationship" or not identifier or identifier in result:
            raise DocumentError()
        result[identifier] = node
    return result


def _relationship_target(archive, part, relationship, kind):
    if (
        relationship is None
        or relationship.get("TargetMode", "Internal") != "Internal"
        or relationship.get("Type") not in {ns + "/" + kind for ns in RELATIONSHIP_NAMESPACES}
    ):
        raise DocumentError()
    target = relationship.get("Target", "")
    if any(ord(char) < 32 for char in target):
        raise DocumentError()
    uri = urlsplit(target)
    if not target or uri.scheme or uri.netloc or uri.query or uri.fragment:
        raise DocumentError()
    path = unquote(uri.path, errors="strict")
    if "\\" in path or any(ord(char) < 32 for char in path):
        raise DocumentError()
    components = [] if path.startswith("/") else list(PurePosixPath(part).parent.parts)
    for component in path.split("/"):
        if component in {"", "."}:
            continue
        if component == "..":
            if not components:
                raise DocumentError()
            components.pop()
        else:
            components.append(component)
    resolved = "/".join(components)
    if not resolved.endswith(".xml") or resolved not in archive.namelist():
        raise DocumentError()
    return resolved


def _ordered_parts(archive, part, root_name, container_name, element_name, kind):
    root = _xml(archive, part)
    containers = [node for node in root if _local(node) == container_name]
    if _local(root) != root_name or len(containers) != 1 or not len(containers[0]):
        raise DocumentError()
    relationships = _relationships(archive, part)
    result = []
    seen = set()
    names = set()
    for node in containers[0]:
        identifiers = [node.get("{" + ns + "}id") for ns in RELATIONSHIP_NAMESPACES]
        identifiers = [identifier for identifier in identifiers if identifier]
        if _local(node) != element_name or len(identifiers) != 1:
            raise DocumentError()
        target = _relationship_target(archive, part, relationships.get(identifiers[0]), kind)
        if target in seen:
            raise DocumentError()
        seen.add(target)
        name = node.get("name", "") if kind == "worksheet" else ""
        if kind == "worksheet":
            if not name.strip() or name.casefold() in names:
                raise DocumentError()
            names.add(name.casefold())
        result.append((name, target))
    return result, relationships


def office_text(data, extension):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > 2000 or len(set(names)) != len(names):
            raise DocumentError("source_archive_too_large")
        if sum(entry.file_size for entry in entries) > MAX_ARCHIVE_BYTES:
            raise DocumentError("source_archive_too_large")
        for entry in entries:
            name = entry.filename.lower()
            if (
                entry.flag_bits & 1
                or entry.file_size > MAX_XML_BYTES
                or name.startswith("/")
                or ".." in PurePosixPath(name).parts
                or "\\" in name
                or any(part in name for part in ("vbaproject", "activex/", "embeddings/"))
            ):
                raise DocumentError("source_invalid_file")
        if "[Content_Types].xml" not in names:
            raise DocumentError()
        content_types = archive.read("[Content_Types].xml").lower()
        if b"macroenabled" in content_types or b"vba" in content_types:
            raise DocumentError("source_invalid_file")
        parts = []
        length = 0

        def append(value):
            nonlocal length
            length += len(value) + 1
            if length > MAX_TEXT_CHARS:
                raise DocumentError("source_text_too_large")
            parts.append(value)

        if extension == ".docx":
            doc_parts = ["word/document.xml"] + sorted(
                name
                for name in names
                if re.fullmatch(
                    r"word/(?:header[0-9]+|footer[0-9]+|footnotes|endnotes|comments)\.xml", name
                )
            )
            for name in doc_parts:
                for node in _xml(archive, name).iter():
                    if _local(node) == "p":
                        append(_texts(node))
        elif extension == ".pptx":
            slides, _ = _ordered_parts(
                archive, "ppt/presentation.xml", "presentation", "sldIdLst", "sldId", "slide"
            )
            for number, (_, name) in enumerate(slides, 1):
                append(f"[Slide {number}]")
                root = _xml(archive, name)
                if _local(root) != "sld":
                    raise DocumentError()
                for node in root.iter():
                    if _local(node) == "p":
                        append(_texts(node))
        else:
            sheets, relationships = _ordered_parts(
                archive, "xl/workbook.xml", "workbook", "sheets", "sheet", "worksheet"
            )
            shared = []
            shared_relationships = [
                relationship
                for relationship in relationships.values()
                if relationship.get("Type")
                in {ns + "/sharedStrings" for ns in RELATIONSHIP_NAMESPACES}
            ]
            if len(shared_relationships) > 1:
                raise DocumentError()
            if shared_relationships:
                name = _relationship_target(
                    archive, "xl/workbook.xml", shared_relationships[0], "sharedStrings"
                )
                root = _xml(archive, name)
                if _local(root) != "sst":
                    raise DocumentError()
                shared = [_texts(node) for node in root]
            for number, (label, name) in enumerate(sheets, 1):
                append(f"[Sheet {number}: {label}]")
                root = _xml(archive, name)
                if _local(root) != "worksheet":
                    raise DocumentError()
                for row in root.iter():
                    if _local(row) != "row":
                        continue
                    cells = []
                    for cell in row:
                        if _local(cell) != "c":
                            continue
                        value = next((n.text or "" for n in cell if _local(n) == "v"), "")
                        if cell.get("t") == "s":
                            index = int(value)
                            if not 0 <= index < len(shared):
                                raise DocumentError()
                            value = shared[index]
                        elif cell.get("t") == "inlineStr":
                            value = _texts(cell)
                        formula = next((n.text for n in cell if _local(n) == "f"), None)
                        if formula:
                            value += f" [formula: {formula}; stored result only]"
                        cells.append(f"{cell.get('r', '')}: {value}")
                    append(" | ".join(cells))
        return bounded_text("\n".join(parts))


def _reject_active_pdf(reader):
    from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

    pending = [reader.trailer]
    visited = set()
    count = 0
    while pending:
        value = pending.pop()
        count += 1
        if count > 100_000:
            raise DocumentError("source_processing_failed")
        if isinstance(value, IndirectObject):
            key = (value.idnum, value.generation)
            if key in visited:
                continue
            visited.add(key)
            value = value.get_object()
        if isinstance(value, DictionaryObject):
            if any(
                key in value
                for key in (
                    "/JS",
                    "/JavaScript",
                    "/AA",
                    "/XFA",
                    "/EmbeddedFiles",
                    "/RichMediaContent",
                )
            ):
                raise DocumentError("source_active_document")
            if value.get("/S") in {
                "/JavaScript",
                "/Launch",
                "/SubmitForm",
                "/ImportData",
                "/GoToR",
                "/Rendition",
                "/Movie",
                "/Sound",
            }:
                raise DocumentError("source_active_document")
            pending.extend(value.values())
        elif isinstance(value, ArrayObject):
            pending.extend(value)


def _parse(data, filename):
    name = safe_name(filename)
    extension = PurePosixPath(name).suffix.lower()
    media_type = FORMATS.get(extension)
    if media_type is None:
        raise DocumentError("source_unsupported_format")
    if not data or len(data) > MAX_FILE_BYTES:
        raise DocumentError("source_file_too_large" if data else "source_invalid_file")
    result = ParsedDocument(name=name, media_type=media_type)
    if media_type.startswith("image/"):
        from PIL import Image

        if len(data) > MAX_IMAGE_BYTES:
            raise DocumentError("source_image_too_large")
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with Image.open(io.BytesIO(data)) as image:
            if (
                Image.MIME.get(image.format) != media_type
                or max(image.size) > MAX_IMAGE_DIMENSION
                or image.width * image.height > MAX_IMAGE_PIXELS
                or getattr(image, "n_frames", 1) != 1
            ):
                raise DocumentError("source_image_invalid")
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
    elif extension == ".pdf":
        from pypdf import PdfReader

        if not data.startswith(b"%PDF-"):
            raise DocumentError()
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise DocumentError("source_encrypted_document")
        _reject_active_pdf(reader)
        count = len(reader.pages)
        if not 1 <= count <= MAX_PDF_PAGES:
            raise DocumentError("source_pdf_too_many_pages")
        result.page_count = count
        # The native PDF preserves scanned pages and layout for multimodal models.
        # Extracted text aids later source inspection without requiring an OCR service.
        parts = []
        length = 0
        for page in reader.pages:
            text = page.extract_text() or ""
            length += len(text) + 1
            if length > MAX_TEXT_CHARS:
                raise DocumentError("source_text_too_large")
            parts.append(text)
        result.text = "\n".join(parts).strip() or None
    elif extension in {".docx", ".xlsx", ".pptx"}:
        result.text = office_text(data, extension)
    else:
        result.text = text_file(data)
    if result.text is not None:
        result.text = bounded_text(result.text)
    return result


def parse_document(data, filename):
    """Do not let a malformed parser input monopolize the web worker or its memory."""
    if len(data) > MAX_FILE_BYTES:
        raise DocumentError("source_file_too_large")
    try:
        process = subprocess.run(
            [sys.executable, "-m", __name__, safe_name(filename)],
            input=data,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=False,
        )
        if process.returncode != 0:
            raise DocumentError("source_processing_failed")
        result = json.loads(process.stdout)
        if "error" in result:
            raise DocumentError(result["error"])
        return ParsedDocument(**result)
    except (subprocess.TimeoutExpired, ValueError, TypeError, OSError):
        raise DocumentError("source_processing_failed") from None


def _main():
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    logging.disable(logging.CRITICAL)
    try:
        result = asdict(_parse(sys.stdin.buffer.read(MAX_FILE_BYTES + 1), sys.argv[1]))
    except DocumentError as error:
        result = {"error": error.code}
    except Exception:
        result = {"error": "source_invalid_file"}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    _main()
