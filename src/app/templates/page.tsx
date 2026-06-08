import { prisma } from "@/lib/prisma";
import { TemplateEditor } from "@/components/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">E-mailtemplates</h1>
        <p className="text-sm text-slate-500">
          Beschikbare merge fields: <code>{`{{handelsnaam}}`}</code>, <code>{`{{city}}`}</code>,{" "}
          <code>{`{{category}}`}</code>, <code>{`{{sbi}}`}</code>, <code>{`{{website}}`}</code>.
        </p>
      </div>

      <TemplateEditor initialTemplates={templates} />
    </div>
  );
}
