"""Real parsers preserve supported content and reject dangerous or ambiguous inputs."""

import io
import zipfile

import pytest
from PIL import Image
from pypdf import PdfWriter

from life_app.apps.life_ai import documents as d

RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PNS = "http://schemas.openxmlformats.org/package/2006/relationships"


def relationships(items):
    return (
        f'<Relationships xmlns="{PNS}">'
        + "".join(
            f'<Relationship Id="{id}" Type="{RNS}/{kind}" Target="{target}"{mode}/>'
            for id, kind, target, mode in items
        )
        + "</Relationships>"
    )


def office(extension, content, extras=None):
    paths = {
        "docx": "word/document.xml",
        "xlsx": "xl/worksheets/sheet1.xml",
        "pptx": "ppt/slides/slide1.xml",
    }
    files = {"[Content_Types].xml": "<Types/>", paths[extension]: content}
    if extension == "xlsx":
        files["xl/workbook.xml"] = (
            f'<workbook xmlns:r="{RNS}"><sheets>'
            '<sheet name="Values" sheetId="1" r:id="sheet1"/></sheets></workbook>'
        )
        items = [("sheet1", "worksheet", "worksheets/sheet1.xml", "")]
        if "xl/sharedStrings.xml" in (extras or {}):
            items.append(("shared", "sharedStrings", "sharedStrings.xml", ""))
        files["xl/_rels/workbook.xml.rels"] = relationships(items)
    elif extension == "pptx":
        files["ppt/presentation.xml"] = (
            f'<presentation xmlns:r="{RNS}"><sldIdLst>'
            '<sldId id="256" r:id="slide1"/></sldIdLst></presentation>'
        )
        files["ppt/_rels/presentation.xml.rels"] = relationships(
            [("slide1", "slide", "slides/slide1.xml", "")]
        )
    files.update(extras or {})
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return target.getvalue()


def pdf(*, pages=1, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=100, height=100)
    if encrypted:
        writer.encrypt("secret")
    result = io.BytesIO()
    writer.write(result)
    return result.getvalue()


@pytest.mark.parametrize("extension", ["txt", "md", "csv"])
def test_text_import_in_isolated_worker_retains_unicode_and_normalizes_filename(extension):
    result = d.parse_document("Échéance\n123 €".encode(), f"../private\\notes.{extension}")
    assert result.name == "notes." + extension
    assert result.text == "Échéance\n123 €"
    assert result.media_type == d.FORMATS["." + extension]


def test_text_cannot_masquerade_as_pdf_or_contain_binary_controls():
    for data, name in [(b"not a PDF", "paper.pdf"), (b"binary\x00data", "paper.txt")]:
        with pytest.raises(d.DocumentError, match="source_invalid_file"):
            d.parse_document(data, name)
    with pytest.raises(d.DocumentError, match="source_text_encoding"):
        d.parse_document(b"\xff\xee\x00", "paper.txt")
    with pytest.raises(d.DocumentError, match="source_text_too_large"):
        d.parse_document(b"x" * (d.MAX_TEXT_CHARS + 1), "paper.txt")


def test_pdf_scans_have_native_payload_but_no_invented_text():
    result = d.parse_document(pdf(), "scan.pdf")
    assert result.page_count == 1
    assert result.text is None
    for data, code in [
        (pdf(encrypted=True), "source_encrypted_document"),
        (pdf(pages=51), "source_pdf_too_many_pages"),
    ]:
        with pytest.raises(d.DocumentError, match=code):
            d.parse_document(data, "scan.pdf")


@pytest.mark.parametrize("kind,extension", [("PNG", "png"), ("JPEG", "jpg"), ("WEBP", "webp")])
def test_real_images_require_matching_type_and_full_decode(kind, extension):
    out = io.BytesIO()
    Image.new("RGB", (30, 20), (10, 20, 30)).save(out, format=kind)
    result = d.parse_document(out.getvalue(), "image." + extension)
    assert result.media_type.startswith("image/")
    with pytest.raises(d.DocumentError):
        d.parse_document(out.getvalue()[:30], "image." + extension)
    with pytest.raises(d.DocumentError):
        d.parse_document(out.getvalue(), "image.txt")


def test_mismatched_and_oversized_images_are_explicit_errors():
    out = io.BytesIO()
    Image.new("RGB", (8001, 1)).save(out, format="PNG")
    with pytest.raises(d.DocumentError, match="source_image_invalid"):
        d.parse_document(out.getvalue(), "image.png")
    with pytest.raises(d.DocumentError, match="source_image_invalid"):
        d.parse_document(out.getvalue(), "image.jpg")


def test_office_readers_keep_paragraphs_shared_strings_and_slides():
    docx = office("docx", "<doc><p><t>Bonjour</t><t> monde</t></p><p><t>Suite</t></p></doc>")
    xlsx = office(
        "xlsx",
        '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c>'
        '<c r="B1"><v>42</v></c></row></sheetData></worksheet>',
        {"xl/sharedStrings.xml": "<sst><si><t>Valeur</t></si></sst>"},
    )
    pptx = office("pptx", "<sld><p><t>Présentation</t></p></sld>")
    assert d.parse_document(docx, "notes.docx").text == "Bonjour monde\nSuite"
    assert "A1: Valeur | B1: 42" in d.parse_document(xlsx, "table.xlsx").text
    assert "Présentation" in d.parse_document(pptx, "slides.pptx").text


def test_office_active_payloads_external_entities_and_expansion_bombs_are_rejected():
    files = [
        office("docx", "<doc/>", {"word/vbaProject.bin": b"macro"}),
        office("docx", "<doc/>", {"word/embeddings/object.bin": b"object"}),
        office("docx", '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><doc>&x;</doc>'),
        office("docx", "x" * (d.MAX_XML_BYTES + 1)),
    ]
    for content in files:
        with pytest.raises(d.DocumentError):
            d.parse_document(content, "notes.docx")


def test_unsupported_format_is_not_treated_as_arbitrary_text():
    for name in ["script.html", "vector.svg", "macro.docm", "archive.zip"]:
        with pytest.raises(d.DocumentError, match="source_unsupported_format"):
            d.parse_document(b"harmless text", name)


def test_pdf_active_actions_and_embedded_files_are_refused():
    for kind in ("javascript", "embedded"):
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        if kind == "javascript":
            writer.add_js("app.alert('untrusted')")
        else:
            writer.add_attachment("payload.txt", b"untrusted")
        stream = io.BytesIO()
        writer.write(stream)
        with pytest.raises(d.DocumentError, match="source_active_document"):
            d.parse_document(stream.getvalue(), "active.pdf")


def test_workbook_manifest_preserves_reordered_sheet_names_and_values():
    manifest = f'<workbook xmlns:r="{RNS}"><sheets>' + (
        '<sheet name="Expenses" sheetId="2" r:id="expenses"/>'
        '<sheet name="Revenue" sheetId="1" r:id="revenue"/></sheets></workbook>'
    )
    content = office(
        "xlsx",
        '<worksheet><row><c r="A1"><v>100000</v></c></row></worksheet>',
        {
            "xl/workbook.xml": manifest,
            "xl/_rels/workbook.xml.rels": relationships(
                [
                    ("revenue", "worksheet", "worksheets/sheet1.xml", ""),
                    ("expenses", "worksheet", "/xl/worksheets/sheet2.xml", ""),
                ]
            ),
            "xl/worksheets/sheet2.xml": (
                '<worksheet><row><c r="A1"><v>20000</v></c></row></worksheet>'
            ),
            "xl/worksheets/sheet9.xml": (
                '<worksheet><row><c r="A1"><v>999999</v></c></row></worksheet>'
            ),
        },
    )
    result = d.parse_document(content, "reordered.xlsx").text
    assert result == "[Sheet 1: Expenses]\nA1: 20000\n[Sheet 2: Revenue]\nA1: 100000"


def test_presentation_manifest_preserves_reordered_slide_sequence():
    manifest = f'<presentation xmlns:r="{RNS}"><sldIdLst>' + (
        '<sldId id="300" r:id="summary"/><sldId id="256" r:id="details"/></sldIdLst></presentation>'
    )
    content = office(
        "pptx",
        "<sld><p><t>Details second</t></p></sld>",
        {
            "ppt/presentation.xml": manifest,
            "ppt/_rels/presentation.xml.rels": relationships(
                [
                    ("details", "slide", "slides/slide1.xml", ""),
                    ("summary", "slide", "slides/slide2.xml", ""),
                ]
            ),
            "ppt/slides/slide2.xml": "<sld><p><t>Summary first</t></p></sld>",
            "ppt/slides/slide9.xml": "<sld><p><t>Unused orphan</t></p></sld>",
        },
    )
    result = d.parse_document(content, "reordered.pptx").text
    assert result == "[Slide 1]\nSummary first\n[Slide 2]\nDetails second"


@pytest.mark.parametrize(
    "target,mode",
    [
        ("https://example.com/sheet.xml", ""),
        ("worksheets/sheet1.xml", ' TargetMode="External"'),
        ("../../xl/worksheets/sheet1.xml", ""),
        ("%2e%2e/%2e%2e/xl/worksheets/sheet1.xml", ""),
        ("file:///xl/worksheets/sheet1.xml", ""),
        ("worksheets/missing.xml", ""),
        ("worksheets/sheet1.xml#fragment", ""),
    ],
)
def test_unsafe_missing_or_external_office_relationships_are_rejected(target, mode):
    content = office(
        "xlsx",
        '<worksheet><row><c r="A1"><v>42</v></c></row></worksheet>',
        {
            "xl/_rels/workbook.xml.rels": relationships([("sheet1", "worksheet", target, mode)]),
        },
    )
    with pytest.raises(d.DocumentError, match="source_invalid_file"):
        d.parse_document(content, "invalid.xlsx")


@pytest.mark.parametrize(
    "extra",
    [
        {"xl/workbook.xml": '<workbook><sheets><sheet name="No reference"/></sheets></workbook>'},
        {"xl/_rels/workbook.xml.rels": relationships([])},
        {
            "xl/_rels/workbook.xml.rels": relationships(
                [
                    ("sheet1", "worksheet", "worksheets/sheet1.xml", ""),
                    ("sheet1", "worksheet", "worksheets/sheet1.xml", ""),
                ]
            )
        },
        {"xl/workbook.xml": "<workbook/>"},
    ],
)
def test_incomplete_or_ambiguous_office_manifests_do_not_fall_back_to_zip_order(extra):
    content = office("xlsx", '<worksheet><row><c r="A1"><v>42</v></c></row></worksheet>', extra)
    with pytest.raises(d.DocumentError, match="source_invalid_file"):
        d.parse_document(content, "invalid.xlsx")
