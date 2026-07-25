"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/components/providers/app-provider";
import { getHelpContent, type HelpSection } from "@/lib/help/content";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

function sectionMatches(section: HelpSection, q: string): boolean {
  if (!q) return true;
  const hay = [
    section.title,
    section.summary,
    ...section.paragraphs,
    ...(section.bullets || []).flatMap((b) => [b.title, b.body]),
    ...(section.tips || []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export default function HelpPage() {
  const { t, locale } = useApp();
  const content = useMemo(() => getHelpContent(locale), [locale]);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    {}
  );
  const [activeId, setActiveId] = useState<string>("");

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return content.groups
      .map((g) => ({
        ...g,
        sections: g.sections.filter((s) => sectionMatches(s, q)),
      }))
      .filter((g) => g.sections.length > 0);
  }, [content.groups, q]);

  // Expand all matching groups when searching; otherwise default first group open
  useEffect(() => {
    if (q) {
      const next: Record<string, boolean> = {};
      const nextSec: Record<string, boolean> = {};
      for (const g of filteredGroups) {
        next[g.id] = true;
        for (const s of g.sections) nextSec[s.id] = true;
      }
      setOpenGroups(next);
      setOpenSections(nextSec);
      return;
    }
    setOpenGroups((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const first = content.groups[0]?.id;
      return first ? { [first]: true } : {};
    });
  }, [q, filteredGroups, content.groups]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
    setActiveId(id);
  }

  function expandAll() {
    const g: Record<string, boolean> = {};
    const s: Record<string, boolean> = {};
    for (const group of content.groups) {
      g[group.id] = true;
      for (const sec of group.sections) s[sec.id] = true;
    }
    setOpenGroups(g);
    setOpenSections(s);
  }

  function collapseAll() {
    setOpenGroups({});
    setOpenSections({});
  }

  function goToSection(groupId: string, sectionId: string) {
    setOpenGroups((prev) => ({ ...prev, [groupId]: true }));
    setOpenSections((prev) => ({ ...prev, [sectionId]: true }));
    setActiveId(sectionId);
    requestAnimationFrame(() => {
      document
        .getElementById(`help-${sectionId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const totalSections = content.groups.reduce(
    (n, g) => n + g.sections.length,
    0
  );
  const shownSections = filteredGroups.reduce(
    (n, g) => n + g.sections.length,
    0
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        kicker={t.nav.help}
        title={t.help.title}
        subtitle={t.help.subtitle}
      />

      <Card premium>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            {content.intro}
          </p>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-faint)]"
              aria-hidden
            />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.help.searchPlaceholder}
              aria-label={t.help.searchPlaceholder}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-faint)]">
            <span>
              {q
                ? t.help.resultsCount
                    .replace("{n}", String(shownSections))
                    .replace("{total}", String(totalSections))
                : t.help.sectionsCount.replace("{n}", String(totalSections))}
            </span>
            <span className="text-white/20">·</span>
            <button
              type="button"
              className="text-[var(--accent)] hover:underline"
              onClick={expandAll}
            >
              {t.help.expandAll}
            </button>
            <span className="text-white/20">·</span>
            <button
              type="button"
              className="text-[var(--accent)] hover:underline"
              onClick={collapseAll}
            >
              {t.help.collapseAll}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        {/* TOC */}
        <nav
          className="lg:sticky lg:top-4 lg:self-start"
          aria-label={t.help.toc}
        >
          <Card premium className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4" aria-hidden />
                {t.help.toc}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto pb-4 text-sm">
              {filteredGroups.map((g) => (
                <div key={g.id}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-faint)]">
                    {g.title}
                  </p>
                  <ul className="space-y-0.5">
                    {g.sections.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => goToSection(g.id, s.id)}
                          className={cn(
                            "w-full rounded-lg px-2 py-1.5 text-left text-xs transition",
                            activeId === s.id
                              ? "bg-[var(--accent)]/15 text-[var(--fg)]"
                              : "text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]"
                          )}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {filteredGroups.length === 0 && (
                <p className="text-xs text-[var(--fg-faint)]">
                  {t.help.noResults}
                </p>
              )}
            </CardContent>
          </Card>
        </nav>

        {/* Content */}
        <div className="space-y-4">
          {filteredGroups.length === 0 && (
            <Card premium>
              <CardContent className="py-10 text-center text-sm text-[var(--fg-faint)]">
                {t.help.noResults}
              </CardContent>
            </Card>
          )}

          {filteredGroups.map((group) => {
            const groupOpen = !!openGroups[group.id];
            return (
              <Card key={group.id} premium>
                <CardHeader className="pb-2">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={groupOpen}
                  >
                    <span className="mt-0.5 text-[var(--fg-faint)]">
                      {groupOpen ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{group.title}</CardTitle>
                      <p className="mt-1 text-xs text-[var(--fg-faint)]">
                        {group.description}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--fg-faint)]">
                      {group.sections.length}
                    </span>
                  </button>
                </CardHeader>

                {groupOpen && (
                  <CardContent className="space-y-2 border-t border-white/10 pt-3">
                    {group.sections.map((section) => {
                      const open = !!openSections[section.id];
                      return (
                        <article
                          key={section.id}
                          id={`help-${section.id}`}
                          className="scroll-mt-4 rounded-2xl border border-white/10 bg-black/20"
                        >
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 px-4 py-3 text-left"
                            onClick={() => toggleSection(section.id)}
                            aria-expanded={open}
                          >
                            <span className="mt-0.5 text-[var(--fg-faint)]">
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-[var(--fg)]">
                                {section.title}
                              </h3>
                              <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-faint)]">
                                {section.summary}
                              </p>
                            </div>
                          </button>

                          {open && (
                            <div className="space-y-3 border-t border-white/10 px-4 py-4">
                              {section.paragraphs.map((p, i) => (
                                <p
                                  key={i}
                                  className="text-sm leading-relaxed text-[var(--fg-muted)]"
                                >
                                  {p}
                                </p>
                              ))}

                              {section.bullets && section.bullets.length > 0 && (
                                <ul className="space-y-2">
                                  {section.bullets.map((b, i) => (
                                    <li
                                      key={i}
                                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                                    >
                                      <p className="text-sm font-medium text-[var(--fg)]">
                                        {b.title}
                                      </p>
                                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-faint)]">
                                        {b.body}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {section.tips && section.tips.length > 0 && (
                                <div className="space-y-1.5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2.5">
                                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-100">
                                    <Lightbulb className="h-3.5 w-3.5" />
                                    {t.help.tips}
                                  </p>
                                  <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-50/90">
                                    {section.tips.map((tip, i) => (
                                      <li key={i}>{tip}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {section.href && (
                                <Link
                                  href={section.href}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                                >
                                  {t.help.openScreen}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
