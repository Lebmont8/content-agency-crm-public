"use client";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/provider";
import type { Segment } from "@/domain/segments";
const VARIANTS: Record<Segment, "whale" | "success" | "warning" | "danger"> = {
    whale: "whale",
    new: "success",
    dormant: "warning",
    expired: "danger",
};
export function SegmentBadges({ segments }: {
    segments: Segment[];
}) {
    const { dict } = useI18n();
    if (segments.length === 0)
        return null;
    return (<span className="inline-flex flex-wrap gap-1">
      {segments.map((s) => (<Badge key={s} variant={VARIANTS[s]}>
          {s === "whale" ? `🐋 ${dict.segments.whale}` : dict.segments[s]}
        </Badge>))}
    </span>);
}
