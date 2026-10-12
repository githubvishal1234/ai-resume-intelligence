import { useNavigate } from "react-router-dom";
import { FileDrop } from "@/components/resume/FileDrop";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { PageLoading } from "@/components/ui/States";
import { useUploadResume } from "@/hooks/useResumes";
import { ApiError } from "@/services/apiClient";
import { PageHeader } from "./common";

export function UploadPage() {
  const upload = useUploadResume();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Upload your resume"
        description="We extract the text and organize it into sections. Nothing is saved until you review it."
        back={{ to: "/resumes", label: "My Resumes" }}
      />
      <Card>
        {upload.isPending ? (
          <PageLoading label="Reading your resume" />
        ) : (
          <FileDrop
            onFile={(file) =>
              upload.mutate(file, { onSuccess: (item) => navigate(`/resumes/imports/${item.id}`) })
            }
          />
        )}
        {upload.isError ? (
          <Notice tone="critical" title="This file could not be used" className="mt-4">
            {upload.error instanceof ApiError ? upload.error.message : "Something went wrong. Please try again."}
          </Notice>
        ) : null}
      </Card>
      <p className="mt-4 text-body-sm text-on-surface-variant">
        Parsing is rule-based: it copies text from your file and never adds anything. Scanned images without a
        text layer cannot be read.
      </p>
    </div>
  );
}
