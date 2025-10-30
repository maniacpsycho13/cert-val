"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function ConfirmationDialog({
  open,
  onOpenChange,
  details,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  details: {
    certificateId: string
    issuerName: string
    issueDate: string
  }
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-pretty">Certificate generated successfully</DialogTitle>
          <DialogDescription className="text-pretty">
            The certificate has been created. You can view or download it below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-md bg-muted/40 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Certificate ID:</span> {details.certificateId}
          </p>
          <p>
            <span className="text-muted-foreground">Issuer Name:</span> {details.issuerName}
          </p>
          <p>
            <span className="text-muted-foreground">Issue Date:</span> {details.issueDate}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          {/* UI-only buttons */}
          <Button variant="outline" aria-label="View the generated certificate (UI only)">
            View Certificate
          </Button>
          <Button aria-label="Download the generated certificate (UI only)">Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
