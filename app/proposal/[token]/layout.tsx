// Public layout — bypasses the global LoginGate
// We render our own shell in the page component
export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
