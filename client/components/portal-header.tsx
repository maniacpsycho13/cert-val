// Header section: title, subtitle, connect wallet button
import { Button } from "@/components/ui/button"

export function HeaderBar() {
  return (
    <header className="flex items-center justify-between gap-4 rounded-lg bg-card/80 px-4 py-4 shadow-sm">
      {/* Left: Title + subtitle */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-pretty">Issuer Portal</h1>
        <p className="text-sm text-muted-foreground text-pretty">Create and issue new certificates here.</p>
      </div>

      {/* Right: Connect Wallet (UI only) */}
      <div className="flex items-center">
        <Button variant="outline" aria-label="Connect a wallet (UI only)">
          Connect Wallet
        </Button>
      </div>
    </header>
  )
}
