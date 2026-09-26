import axios from 'axios'
import './App.css';
import { useState, useEffect, useMemo } from 'react'

const TYPE_COLORS = {
  normal: "#9099A2", fire: "#FF9C54", water: "#4D90D5", electric: "#F4D23C",
  grass: "#63BC5A", ice: "#74CEC0", fighting: "#CE4069", poison: "#AB6AC8",
  ground: "#D97845", flying: "#8FA8DD", psychic: "#FA7179", bug: "#90C12C",
  rock: "#C7B78B", ghost: "#5269AD", dragon: "#0B6DC3", dark: "#5A5465",
  steel: "#5A8EA2", fairy: "#EC8FE6"
};

const BROWSE_PAGE_SIZE = 30;

const GENERATIONS = [
  { id: 1, label: 'Gen 1', range: [1, 151] },
  { id: 2, label: 'Gen 2', range: [152, 251] },
  { id: 3, label: 'Gen 3', range: [252, 386] },
  { id: 4, label: 'Gen 4', range: [387, 493] },
  { id: 5, label: 'Gen 5', range: [494, 649] },
  { id: 6, label: 'Gen 6', range: [650, 721] },
  { id: 7, label: 'Gen 7', range: [722, 809] },
  { id: 8, label: 'Gen 8', range: [810, 905] },
  { id: 9, label: 'Gen 9', range: [906, 1025] },
];

function PokeballIcon({ size = 30, color = '#e3350d' }) {
  return (
    <svg className="pokeball-icon" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="#fff" stroke="#1c2230" strokeWidth="6" />
      <path d="M5 50 a45 45 0 0 1 90 0 Z" fill={color} stroke="#1c2230" strokeWidth="6" />
      <rect x="5" y="46" width="90" height="8" fill="#1c2230" />
      <circle cx="50" cy="50" r="13" fill="#fff" stroke="#1c2230" strokeWidth="6" />
    </svg>
  )
}

function artworkUrl(id, shiny) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`
}

function evolutionLabel(details) {
  if (!details) return null
  const { trigger, min_level, item, held_item, min_happiness, time_of_day } = details
  if (!trigger) return null
  if (trigger === 'level-up') {
    if (min_level) return `Lv. ${min_level}`
    if (min_happiness) return 'High friendship'
    if (time_of_day) return time_of_day === 'day' ? 'Level up (day)' : 'Level up (night)'
    return 'Level up'
  }
  if (trigger === 'trade') return held_item ? `Trade holding ${held_item.replace(/-/g, ' ')}` : 'Trade'
  if (trigger === 'use-item') return item ? `Use ${item.replace(/-/g, ' ')}` : 'Use item'
  return trigger.replace(/-/g, ' ')
}

function flattenChain(node, depth = 0, rows = []) {
  if (!rows[depth]) rows[depth] = []
  rows[depth].push({
    name: node.species.name,
    label: evolutionLabel(node.evolution_details[0]),
  })
  node.evolves_to.forEach((child) => flattenChain(child, depth + 1, rows))
  return rows
}

function App() {
  const [view, setView] = useState('search')
  const [shiny, setShiny] = useState(false)

  const [pokemon, setPokemon] = useState('')
  const [value, setValue] = useState(null)
  const [description, setDescription] = useState('')
  const [evolution, setEvolution] = useState([])
  const [effectiveness, setEffectiveness] = useState({ weak: [], strong: [] })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [allPokemon, setAllPokemon] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')
  const [browsePage, setBrowsePage] = useState(0)
  const [browseGen, setBrowseGen] = useState(null)

  useEffect(() => {
    setListLoading(true)
    axios.get('https://pokeapi.co/api/v2/pokemon?limit=2000&offset=0')
      .then((res) => {
        const parsed = res.data.results.map((p) => {
          const match = p.url.match(/\/pokemon\/(\d+)\/?$/)
          return { name: p.name, id: match ? Number(match[1]) : null }
        }).filter((p) => p.id)
        setAllPokemon(parsed)
      })
      .catch(() => setAllPokemon([]))
      .finally(() => setListLoading(false))
  }, [])

  async function loadSpeciesData(speciesUrl) {
    const res = await axios.get(speciesUrl)
    return res.data
  }

  function extractDescription(speciesData) {
    const flavorEntry = speciesData.flavor_text_entries.find((f) => f.language.name === 'en')
    return flavorEntry ? flavorEntry.flavor_text.replace(/[\n\f\r]/g, ' ') : ''
  }

  async function loadEvolutionChain(speciesData) {
    const chainRes = await axios.get(speciesData.evolution_chain.url)
    const rows = flattenChain(chainRes.data.chain)

    const withArt = await Promise.all(
      rows.map((row) =>
        Promise.all(
          row.map(async (entry) => {
            try {
              const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${entry.name}`)
              const art = res.data.sprites.other?.['official-artwork']
              return {
                ...entry,
                id: res.data.id,
                sprite: art?.front_default || res.data.sprites.front_default,
                shinySprite: art?.front_shiny || res.data.sprites.front_shiny,
              }
            } catch {
              return { ...entry, id: null, sprite: null, shinySprite: null }
            }
          })
        )
      )
    )

    return withArt
  }

  async function loadTypeEffectiveness(typeRefs) {
    const results = await Promise.all(typeRefs.map((t) => axios.get(t.url)))
    const multiplier = {}
    results.forEach((res) => {
      const dr = res.data.damage_relations
      dr.double_damage_from.forEach((t) => { multiplier[t.name] = (multiplier[t.name] ?? 1) * 2 })
      dr.half_damage_from.forEach((t) => { multiplier[t.name] = (multiplier[t.name] ?? 1) * 0.5 })
      dr.no_damage_from.forEach((t) => { multiplier[t.name] = (multiplier[t.name] ?? 1) * 0 })
    })
    const entries = Object.entries(multiplier)
    const weak = entries.filter(([, m]) => m > 1).sort((a, b) => b[1] - a[1])
    const strong = entries.filter(([, m]) => m < 1).sort((a, b) => a[1] - b[1])
    return { weak, strong }
  }

  function fetchPokemon(rawName) {
    const name = rawName.trim().toLowerCase().replace(/^#/, '')
    if (!name) return

    setLoading(true)
    setError(null)
    setView('search')

    axios.get(`https://pokeapi.co/api/v2/pokemon/${name}`)
      .then(async (response) => {
        setValue(response.data)
        setPokemon(response.data.name)

        let speciesData = null
        try {
          speciesData = await loadSpeciesData(response.data.species.url)
          setDescription(extractDescription(speciesData))
        } catch {
          setDescription('')
        }

        try {
          if (speciesData) {
            const evo = await loadEvolutionChain(speciesData)
            setEvolution(evo)
          } else {
            setEvolution([])
          }
        } catch {
          setEvolution([])
        }

        try {
          const eff = await loadTypeEffectiveness(response.data.types.map((t) => t.type))
          setEffectiveness(eff)
        } catch {
          setEffectiveness({ weak: [], strong: [] })
        }
      })
      .catch(() => {
        setValue(null)
        setDescription('')
        setEvolution([])
        setEffectiveness({ weak: [], strong: [] })
        setError(`Couldn't find "${name}"`)
      })
      .finally(() => setLoading(false))
  }

  function goToLanding() {
    setView('search')
    setValue(null)
    setDescription('')
    setEvolution([])
    setEffectiveness({ weak: [], strong: [] })
    setError(null)
    setPokemon('')
  }

  function handleButton() {
    fetchPokemon(pokemon)
  }

  function handleInputChange(event) {
    setPokemon(event.target.value)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') handleButton()
  }

  const types = value?.types?.map((t) => t.type.name) ?? []
  const primaryColor = types[0] ? TYPE_COLORS[types[0]] : '#4F9DDE'

  const mainArt = value
    ? (shiny ? artworkUrl(value.id, true) : artworkUrl(value.id, false))
    : null

  const filteredList = useMemo(() => {
    const q = browseQuery.trim().toLowerCase()
    const gen = browseGen ? GENERATIONS.find((g) => g.id === browseGen) : null
    return allPokemon.filter((p) => {
      const matchesQuery = !q || p.name.includes(q)
      const matchesGen = !gen || (p.id >= gen.range[0] && p.id <= gen.range[1])
      return matchesQuery && matchesGen
    })
  }, [allPokemon, browseQuery, browseGen])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / BROWSE_PAGE_SIZE))
  const pageItems = filteredList.slice(
    browsePage * BROWSE_PAGE_SIZE,
    browsePage * BROWSE_PAGE_SIZE + BROWSE_PAGE_SIZE
  )

  function handleBrowseQueryChange(event) {
    setBrowseQuery(event.target.value)
    setBrowsePage(0)
  }

  function handleGenSelect(genId) {
    setBrowseGen((current) => (current === genId ? null : genId))
    setBrowsePage(0)
  }

  return (
    <div className="page">
      <header className="navbar-wrapper">
        <nav className="navbar">
          <div className="navbar-brand">
            <button type="button" className="brand-ball" onClick={goToLanding} aria-label="Back to home">
              <PokeballIcon />
            </button>
            <h1 className="brand">Mc's Pokédex</h1>
          </div>

          {(view === 'browse' || (view === 'search' && value)) && (
            <div className="navbar-search">
              {view === 'search' ? (
                <>
                  <input
                    type="text"
                    value={pokemon}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Name or No. (e.g. bulbasaur or 1)"
                  />
                  <button onClick={handleButton} disabled={loading}>
                    {loading ? '···' : 'Search'}
                  </button>
                </>
              ) : (
                <input
                  type="text"
                  value={browseQuery}
                  onChange={handleBrowseQueryChange}
                  placeholder="Filter by name..."
                />
              )}
            </div>
          )}

          <div className="tab-row">
            <button
              type="button"
              className={'tab' + (view === 'search' ? ' active' : '')}
              onClick={() => setView('search')}
            >
              Search
            </button>
            <button
              type="button"
              className={'tab' + (view === 'browse' ? ' active' : '')}
              onClick={() => setView('browse')}
            >
              Browse All
            </button>
            <button
              type="button"
              className={'tab shiny-tab' + (shiny ? ' active' : '')}
              onClick={() => setShiny((s) => !s)}
              title={shiny ? 'Shiny mode on' : 'Shiny mode off'}
            >
              Shiny
            </button>
          </div>
        </nav>
      </header>

      <main className="content">
      {view === 'search' && (
        <>
          {error && <p className="error-text">{error}</p>}

          {!value && (
            <section className="hero">
              <div className="hero-text">
                <h2 className="hero-heading">Who's That Pokémon?</h2>
                <p className="hero-subtext">
                  Search any name or Pokédex number to see its types, description, and evolutions.
                </p>
                <div className="search-pill">
                  <input
                    type="text"
                    value={pokemon}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="pikachu, charizard, or #150"
                  />
                  <button onClick={handleButton} disabled={loading}>
                    {loading ? '···' : 'Search'}
                  </button>
                </div>
                <div className="quick-picks">
                  {['pikachu', 'charizard', 'eevee', 'mewtwo'].map((name) => (
                    <button
                      type="button"
                      key={name}
                      className="quick-chip"
                      onClick={() => fetchPokemon(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hero-ball-wrap">
                <PokeballIcon size={280} />
              </div>
            </section>
          )}

          {value && (
            <>
              <div className="card" style={{ '--type-color': primaryColor }}>
                <div className="card-header">
                  <h2 className="name">{value.name}</h2>
                  <span className="num">No. {String(value.id).padStart(3, '0')}</span>
                </div>

                <div className="card-art">
                  <img
                    src={mainArt}
                    alt={value.name}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </div>

                <div className="types">
                  {types.map((t) => (
                    <span
                      key={t}
                      className="badge"
                      style={{ background: TYPE_COLORS[t] || '#888' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {description && <p className="description">{description}</p>}

                <div className="effectiveness">
                  <div className="effectiveness-group">
                    <h3>Weak against</h3>
                    <div className="effectiveness-badges">
                      {effectiveness.weak.length === 0 && <span className="hint-text">None</span>}
                      {effectiveness.weak.map(([typeName]) => (
                        <span
                          key={typeName}
                          className="badge eff-badge"
                          style={{ background: TYPE_COLORS[typeName] || '#888' }}
                        >
                          {typeName}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="effectiveness-group">
                    <h3>Strong against</h3>
                    <div className="effectiveness-badges">
                      {effectiveness.strong.length === 0 && <span className="hint-text">None</span>}
                      {effectiveness.strong.map(([typeName]) => (
                        <span
                          key={typeName}
                          className="badge eff-badge"
                          style={{ background: TYPE_COLORS[typeName] || '#888' }}
                        >
                          {typeName}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {evolution.length > 1 && (
                <div className="evolution-row">
                  {evolution.flat().map((entry) => (
                    <button
                      type="button"
                      key={entry.name}
                      className={'mini-card' + (entry.name === value.name ? ' current' : '')}
                      onClick={() => fetchPokemon(entry.name)}
                      disabled={loading}
                    >
                      {(shiny ? entry.shinySprite : entry.sprite) && (
                        <img
                          src={shiny ? entry.shinySprite : entry.sprite}
                          alt={entry.name}
                        />
                      )}
                      <span className="mini-name">{entry.name}</span>
                      {entry.label && <span className="mini-label">{entry.label}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {view === 'browse' && (
        <>
          {listLoading && <p className="hint-text">Loading Pokédex...</p>}

          {!listLoading && (
            <>
              <div className="gen-row">
                <button
                  type="button"
                  className={'gen-btn' + (browseGen === null ? ' active' : '')}
                  onClick={() => handleGenSelect(null)}
                >
                  All
                </button>
                {GENERATIONS.map((gen) => (
                  <button
                    type="button"
                    key={gen.id}
                    className={'gen-btn' + (browseGen === gen.id ? ' active' : '')}
                    onClick={() => handleGenSelect(gen.id)}
                  >
                    {gen.label}
                  </button>
                ))}
              </div>

              <div className="browse-grid">
                {pageItems.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="browse-card"
                    onClick={() => fetchPokemon(p.name)}
                  >
                    <img
                      src={artworkUrl(p.id, shiny)}
                      alt={p.name}
                      loading="lazy"
                      onError={(e) => { e.target.style.visibility = 'hidden' }}
                    />
                    <span className="browse-num">No. {String(p.id).padStart(3, '0')}</span>
                    <span className="browse-name">{p.name}</span>
                  </button>
                ))}
              </div>

              {filteredList.length === 0 && (
                <p className="hint-text">No Pokémon match "{browseQuery}".</p>
              )}

              {filteredList.length > 0 && (
                <div className="pagination-row">
                  <button
                    type="button"
                    onClick={() => setBrowsePage((p) => Math.max(0, p - 1))}
                    disabled={browsePage === 0}
                  >
                    ← Prev
                  </button>
                  <span className="page-indicator">
                    Page {browsePage + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBrowsePage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={browsePage >= totalPages - 1}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      </main>
    </div>
  )
}

export default App