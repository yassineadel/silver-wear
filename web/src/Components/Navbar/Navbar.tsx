// If your frontend is Next.js App Router, uncomment the next line:
// "use client"

import { useEffect, useRef, useState } from "react"
import "./Navbar.css"

type LinkItem = { label: string; href: string }

const LINKS: LinkItem[] = [
  { label: "Shop", href: "/shop" },
  { label: "New in", href: "/new" },
  { label: "Collections", href: "/collections" },
  { label: "About", href: "/about" },
]

const SUGGESTIONS = ["Rings", "Chains", "Gift sets", "Under $100"]

function FlipLink({ label, href }: LinkItem) {
  return (
    <a className="nb__link" href={href}>
      <span className="nb__flip">
        <span className="nb__flipLine">{label}</span>
        <span className="nb__flipLine nb__flipLine--alt">{label}</span>
      </span>
    </a>
  )
}

function Navbar() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)
  const cartCount = 0

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Focus the field the moment the panel opens, so you can just start typing.
  useEffect(() => {
    if (search) inputRef.current?.focus()
  }, [search])

  const openSearch = () => {
    setOpen(false)
    setSearch(true)
  }

  const submit = () => {
    const q = query.trim()
    if (!q) return
    window.location.href = `/search?q=${encodeURIComponent(q)}`
  }

  return (
    <header
      className={
        "nb" +
        (stuck ? " nb--stuck" : "") +
        (open ? " nb--open" : "") +
        (search ? " nb--searching" : "")
      }
    >
      {(search || open) && (
        <div className="nb__scrim" onClick={() => { setSearch(false); setOpen(false) }} />
      )}

      <div className="nb__ticker">
        <p>Free shipping over $150 &nbsp;·&nbsp; 30-day returns</p>
      </div>

      <div className="nb__bar">
        <button
          className="nb__burger"
          type="button"
          aria-expanded={open}
          aria-controls="nb-panel"
          aria-label="Toggle menu"
          onClick={() => { setSearch(false); setOpen(!open) }}
        >
          <span className="nb__burgerBox" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>

        <nav className="nb__links" aria-label="Primary">
          {LINKS.map((item) => (
            <FlipLink key={item.href} label={item.label} href={item.href} />
          ))}
        </nav>

        <a className="nb__wordmark" href="/">
          Atelier
          <span className="nb__wordmarkDot" aria-hidden="true">.</span>
        </a>

        <div className="nb__utils">
          <button
            type="button"
            className="nb__util nb__utilBtn"
            aria-expanded={search}
            aria-controls="nb-search"
            onClick={() => setSearch(!search)}
          >
            {search ? "Close" : "Search"}
          </button>
          <a className="nb__util nb__util--hideSm" href="/account">Account</a>
          <a className="nb__util nb__cart" href="/cart">
            Cart
            <span className="nb__count">{cartCount}</span>
          </a>
        </div>
      </div>

      <div className="nb__search" id="nb-search" data-open={search}>
        <div className="nb__searchInner">
          <div className="nb__searchField">
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="What are you looking for?"
              aria-label="Search products"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
                if (e.key === "Escape") setSearch(false)
              }}
            />
            <button type="button" className="nb__searchGo" onClick={submit}>
              Go
            </button>
          </div>
          <div className="nb__searchHints">
            <span>Popular</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => { setQuery(s); inputRef.current?.focus() }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="nb__panel" id="nb-panel" data-open={open}>
        <div className="nb__panelInner">
          <nav aria-label="Mobile">
            {LINKS.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <button type="button" className="nb__panelSearch" onClick={openSearch}>
            Search
          </button>
          <a className="nb__panelAccount" href="/account" onClick={() => setOpen(false)}>
            Account
          </a>
        </div>
      </div>
    </header>
  )
}

export default Navbar