import { useQuery } from "@tanstack/react-query";
import { outputService } from "@/services/outputService";
import { Chips } from "./TemplateFilters";

/**
 * The font row of the template gallery. A choice sets every preview, the ATS check and the PDF;
 * "Template font" ("") keeps each template's own.
 */
export function FontChips({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const fonts = useQuery({ queryKey: ["output", "fonts"], queryFn: outputService.fonts, staleTime: Infinity });
  return (
    <Chips
      legend="Font"
      allLabel="Template font"
      options={(fonts.data ?? []).map((f) => ({ id: f.id, label: f.name }))}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
