import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type IssuedRow = {
  certificateId: string
  name: string
  course: string
  dateIssued: string
  status: "Issued" | "Revoked"
}

export function IssuedTable({ rows }: { rows: IssuedRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Certificate ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Date Issued</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No certificates issued yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.certificateId}>
                <TableCell className="font-mono text-sm">{r.certificateId}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.course}</TableCell>
                <TableCell>{r.dateIssued}</TableCell>
                <TableCell>
                  {r.status === "Issued" ? (
                    <Badge variant="secondary">Issued</Badge>
                  ) : (
                    <Badge variant="destructive">Revoked</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" aria-label="View certificate (UI only)">
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
