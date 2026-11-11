import { Notice } from "@/components/ui/Notice";
import { useCapabilities } from "@/hooks/useCapabilities";

/** Says where resume text goes, right where it's handed over. Hidden while AI is off. */
export function AiDataNote({ className }: { className?: string }) {
  const { data } = useCapabilities();
  const provider = data?.ai.provider;
  if (!data?.ai.configured || !provider) return null;
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  return (
    <Notice tone="info" title={`AI features send this text to ${name}`} className={className}>
      Resume text, including contact details, goes to {name} so the AI can read and rewrite it. If it's someone else's resume, get their permission first.
    </Notice>
  );
}
