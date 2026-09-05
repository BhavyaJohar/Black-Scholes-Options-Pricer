import Link from 'next/link';

type ActivePage = 'pricer' | 'market' | 'portfolio';

interface TerminalHeaderProps {
  active: ActivePage;
  eyebrow: string;
  title: string;
  description: string;
}

const NAV_ITEMS: Array<{ id: ActivePage; label: string; href: string }> = [
  { id: 'pricer', label: 'Pricer', href: '/' },
  { id: 'market', label: 'Market', href: '/market' },
  { id: 'portfolio', label: 'Portfolio', href: '/portfolio' },
];

export default function TerminalHeader({ active, eyebrow, title, description }: TerminalHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-[#26303a] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#38d9a9]">
          <span className="h-2 w-2 rounded-full bg-[#38d9a9]" aria-hidden="true" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{description}</p>
      </div>
      <nav aria-label="Primary navigation" className="flex gap-1 self-start rounded-md border border-[#26303a] bg-[#0d1319] p-1 text-sm lg:self-auto">
        {NAV_ITEMS.map((item) => item.id === active ? (
          <span key={item.id} className="rounded bg-[#18212a] px-3 py-2 text-white" aria-current="page">
            {item.label}
          </span>
        ) : (
          <Link key={item.id} className="rounded px-3 py-2 text-[#9aa7b3] hover:bg-[#18212a] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#38d9a9]" href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
