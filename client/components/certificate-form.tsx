"use client"

import type React from "react"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type FormData = {
  fullName: string
  studentId: string
  course: string
  grade: string
  issueDate: string // YYYY-MM-DD
  certificateId?: string
}

export function CertificateForm({
  value,
  onChange,
  className,
}: {
  value: FormData
  onChange: (next: FormData) => void
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
      {/* Full Name */}
      <Field label="Full Name">
        <Input
          placeholder="John Doe"
          value={value.fullName}
          onChange={(e) => onChange({ ...value, fullName: e.target.value })}
        />
      </Field>

      {/* Roll Number / Student ID */}
      <Field label="Roll Number / Student ID">
        <Input
          placeholder="STU-123456"
          value={value.studentId}
          onChange={(e) => onChange({ ...value, studentId: e.target.value })}
        />
      </Field>

      {/* Course / Program */}
      <Field label="Course / Program">
        <Input
          placeholder="Computer Science"
          value={value.course}
          onChange={(e) => onChange({ ...value, course: e.target.value })}
        />
      </Field>

      {/* Grade / Percentage */}
      <Field label="Grade / Percentage">
        <Input
          placeholder="A+ or 92%"
          value={value.grade}
          onChange={(e) => onChange({ ...value, grade: e.target.value })}
        />
      </Field>

      {/* Date of Issue (Date picker) */}
      <Field label="Date of Issue">
        <Input
          type="date"
          value={value.issueDate}
          onChange={(e) => onChange({ ...value, issueDate: e.target.value })}
        />
      </Field>

      {/* Certificate ID (auto placeholder only) */}
      <Field label="Certificate ID (auto)">
        <Input placeholder="Will be generated" value={value.certificateId || ""} disabled aria-disabled />
      </Field>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-")
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div id={id}>{children}</div>
    </div>
  )
}
