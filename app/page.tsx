import { BootOverlay } from './regions/BootOverlay'
import { CareerLog } from './regions/CareerLog'
import { Contact } from './regions/Contact'
import { Header } from './regions/Header'
import { Instrument } from './regions/Instrument'
import { ManPage } from './regions/ManPage'
import { TmuxBar } from './regions/TmuxBar'

export default function Page() {
  return (
    <>
      <a className="skip sr-only" href="#whoami">
        skip the animation
      </a>
      <Header />
      <main className="kw-pad">
        <h1 className="sr-only">Kevin Weaver</h1>
        <Instrument />
        <div className="kw-2up" id="whoami" tabIndex={-1}>
          <ManPage />
          <CareerLog />
        </div>
        <Contact />
      </main>
      <TmuxBar />
      <BootOverlay />
    </>
  )
}
