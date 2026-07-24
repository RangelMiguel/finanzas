"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";

export default function ImportExportPage() {
  const { t } = useApp();
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [mode, setMode] = useState("merge");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function doExport() {
    if (exportPassword.length < 4) {
      toast.error(t.importExport.minPassword);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: exportPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "misfinanzas-backup.enc";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t.importExport.exportOk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!file || !importPassword) {
      toast.error(t.importExport.minPassword);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", importPassword);
      fd.append("mode", mode);
      const res = await fetch("/api/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      toast.success(t.importExport.importOk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.importExport}
        title={t.importExport.title}
        subtitle={t.importExport.subtitle}
      />

      <Card premium>
        <CardHeader>
          <CardTitle>{t.importExport.exportTitle}</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md space-y-3">
          <div>
            <Label htmlFor="exp-pass">{t.importExport.encryptPassword}</Label>
            <Input
              id="exp-pass"
              type="password"
              className="mt-1"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-[var(--fg-faint)]">
              {t.importExport.passwordHint}
            </p>
          </div>
          <Button onClick={doExport} disabled={loading}>
            {t.importExport.export}
          </Button>
        </CardContent>
      </Card>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.importExport.importTitle}</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md space-y-3">
          <p className="text-sm text-[var(--fg-muted)]">{t.importExport.importHint}</p>
          <div>
            <Label htmlFor="imp-file">{t.importExport.file}</Label>
            <Input
              id="imp-file"
              type="file"
              accept=".enc,application/octet-stream"
              className="mt-1"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <Label htmlFor="imp-pass">{t.password}</Label>
            <Input
              id="imp-pass"
              type="password"
              className="mt-1"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="imp-mode">{t.importExport.mode}</Label>
            <Select
              id="imp-mode"
              className="mt-1"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="merge">{t.importExport.merge}</option>
              <option value="replace">{t.importExport.replace}</option>
            </Select>
          </div>
          <Button onClick={doImport} disabled={loading} variant="secondary">
            {t.importExport.import}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
