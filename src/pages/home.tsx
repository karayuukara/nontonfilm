import { useState, useEffect, useCallback } from "react";
import { Search, Film, Play } from "lucide-react";
import { MovieCard } from "@/components/movie-card";
import { AdBanner } from "@/components/ad-banner";
import type { Movie } from "@/lib/tmdb";

export default function HomePage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);

  // Load initial movies from static + search popular
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      try {
        // Try static first (always works)
        const res = await fetch("/api/movies/static");
        const all = await res.json();
        if (all.length > 0) {
          // Shuffle and take some
          const shuffled = all.sort(() => Math.random() - 0.5);
          setMovies(shuffled.slice(0, 30));
        }
      } catch {}
      setLoading(false);
    };
    fetchMovies();
  }, []);

  // Search via live scraper
  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/movies/search?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.results?.length) {
        setSearchResults(data.results.slice(0, 12));
      } else {
        // Fallback: filter static movies
        const staticRes = await fetch("/api/movies/static");
        const all = await staticRes.json();
        const ql = q.toLowerCase();
        setSearchResults(all.filter((m: Movie) => m.title.toLowerCase().includes(ql)).slice(0, 12));
      }
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  const displayMovies = search ? searchResults : movies;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <Play className="w-6 h-6 text-red-500 fill-red-500" />
            <span className="font-bold text-lg tracking-tight">NontonFilm</span>
          </a>
          <div className="relative w-full max-w-md ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari film... (jutaan film tersedia)"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
        </div>
      </header>

      {/* Top ad */}
      <AdBanner slot="top" className="max-w-7xl mx-auto px-4 mt-4" />

      {/* Search header */}
      {search && (
        <div className="max-w-7xl mx-auto px-4 mt-6">
          <h2 className="text-lg font-semibold">Hasil pencarian: "{search}"</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Data real-time dari TMDB — jutaan film tersedia
          </p>
        </div>
      )}

      {!search && (
        <div className="max-w-7xl mx-auto px-4 mt-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🎬 Film Pilihan
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Klik film untuk detail & nonton. Cari film apapun lewat search bar — data real-time dari TMDB.
          </p>
        </div>
      )}

      {/* Movie grid */}
      <main className="max-w-7xl mx-auto px-4 mt-6 pb-16">
        {loading || searching ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : displayMovies.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Tidak ada film ditemukan</p>
            <p className="text-xs mt-2">Coba kata kunci lain atau cek koneksi</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayMovies.map(movie => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </main>

      {/* Bottom ad */}
      <AdBanner slot="bottom" className="max-w-7xl mx-auto px-4 pb-8" />
    </div>
  );
}
