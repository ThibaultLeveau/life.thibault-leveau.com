import { useEffect, useId, useRef, useState } from "react";
import { tr } from "../../shared/i18n";
import { Icon } from "../../shared/ui/Icon";
import { ApplicationCard } from "./ApplicationCard";
import type { Application } from "./types";
import "./carousel.css";

export function ApplicationCarousel({ items }: { items: Application[] }) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  function measure() {
    const element = track.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 2,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    });
  }

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const card of element.children) observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, [items]);

  function scroll(direction: number) {
    const element = track.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    element.scrollBy({
      left: direction * ((card?.offsetWidth ?? element.clientWidth) + gap),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <section className="application-collection" aria-labelledby={`${id}-title`}>
      <div className="application-collection-heading">
        <div>
          <h2 id={`${id}-title`}>{tr("dashboard_applications")}</h2>
          <p>{tr("dashboard_applications_hint")}</p>
        </div>
        <a className="application-collection-library" href="/applications">
          {tr("manage_my_applications")} <Icon name="arrow" size={16} />
        </a>
      </div>
      {items.length ? (
        <>
          <div
            ref={track}
            id={id}
            className="application-carousel"
            role="region"
            aria-roledescription={tr("application_carousel")}
            aria-labelledby={`${id}-title`}
            tabIndex={0}
            onScroll={measure}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const element = track.current;
              if (!element) return;
              const links = Array.from(
                element.querySelectorAll<HTMLAnchorElement>(".application-open"),
              );
              const index = links.indexOf(
                document.activeElement as HTMLAnchorElement,
              );
              let next: number;
              if (event.key === "ArrowRight")
                next = Math.min(index + 1, links.length - 1);
              else if (event.key === "ArrowLeft")
                next = Math.max(index - 1, 0);
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = links.length - 1;
              else return;
              event.preventDefault();
              links[next]?.focus({ preventScroll: true });
            }}
            onFocusCapture={(event) => {
              const element = track.current;
              const card = (event.target as HTMLElement).closest(
                ".application-card",
              );
              if (!element || !card) return;
              const bounds = element.getBoundingClientRect();
              const target = card.getBoundingClientRect();
              if (target.left < bounds.left)
                element.scrollLeft += target.left - bounds.left - 4;
              else if (target.right > bounds.right)
                element.scrollLeft += target.right - bounds.right + 4;
            }}
          >
            {items.map((application) => (
              <ApplicationCard key={application.id} application={application} />
            ))}
          </div>
          <div className="application-carousel-footer">
            <span>{tr("application_count", { count: items.length })}</span>
            <div className="application-carousel-controls">
              <button
                type="button"
                className="icon-button application-carousel-previous"
                aria-label={tr("applications_previous")}
                aria-controls={id}
                disabled={edges.start}
                onClick={() => scroll(-1)}
              >
                <Icon name="chevron" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={tr("applications_next")}
                aria-controls={id}
                disabled={edges.end}
                onClick={() => scroll(1)}
              >
                <Icon name="chevron" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="applications-empty">
          <Icon name="grid" size={32} />
          <p>{tr("choose_your_applications_in_the_library")}</p>
          <a className="primary-button" href="/applications">
            {tr("open_the_library")} <Icon name="arrow" />
          </a>
        </div>
      )}
    </section>
  );
}
