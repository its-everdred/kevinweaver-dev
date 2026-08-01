/**
 * Foundation placeholder.
 *
 * KW-01 owns this file only to prove the toolchain renders. The real page shell
 * and its regions are owned by later tickets — do not build the site here.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1560px] flex-col justify-center p-6">
      <p className="text-[var(--text-faint)]">
        <span className="text-[var(--accent)]">$</span> whoami
      </p>
      <h1 className="mt-2 text-4xl font-extrabold text-[var(--text-strong)]">
        kevin weaver
      </h1>
      <p className="mt-2 text-[var(--text-muted)]">
        lead fullstack software engineer
      </p>
    </main>
  )
}
