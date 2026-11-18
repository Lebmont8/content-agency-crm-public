import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { can } from "@/auth/permissions";
import { getI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createTag, deleteTag, renameTag } from "./actions";
export default async function TagsSettingsPage() {
    const { user } = await requireAuth();
    if (!can(user.role, "assignments.manage"))
        redirect("/settings/security");
    const { dict } = await getI18n();
    const tags = await getTenantDb(user.agencyId).fanTag.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { links: true } } },
    });
    return (<Card>
      <CardHeader>
        <CardTitle>{dict.settings.customTags}</CardTitle>
        <CardDescription>{dict.settings.customTagsHelp}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={createTag} className="flex max-w-md gap-2">
          <Input name="name" maxLength={30} required placeholder={dict.settings.tagPlaceholder}/>
          <Button type="submit">{dict.settings.createTag}</Button>
        </form>

        {tags.length === 0 ? (<p className="text-sm text-muted">{dict.settings.noCustomTags}</p>) : (<div className="space-y-2">
            {tags.map((tag) => (<div key={tag.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                <form action={renameTag} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="id" value={tag.id}/>
                  <Input name="name" defaultValue={tag.name} maxLength={30} required/>
                  <Button type="submit" size="sm" variant="secondary">{dict.common.save}</Button>
                </form>
                <span className="text-xs text-muted">{tag._count.links} {dict.settings.taggedFans}</span>
                <form action={deleteTag}>
                  <input type="hidden" name="id" value={tag.id}/>
                  <Button type="submit" size="sm" variant="destructive">{dict.common.delete}</Button>
                </form>
              </div>))}
          </div>)}
      </CardContent>
    </Card>);
}
