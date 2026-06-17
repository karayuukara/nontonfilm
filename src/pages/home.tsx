import { useState, useEffect, useCallback } from "react";
import { Search, Film, ChevronRight, Play } from "lucide-react";
import { MovieCard } from "@/components/movie-card";
import { AdBanner } from "@/components/ad-banner";
import type { Movie } from "@/lib/tmdb";

const CATEGORIES = [
  { key: "now_playing", label: "Now Playing", endpoint: "/api/movies/now-playing" },
  { key: "top_rated", label: "Top Rated", endpoint: "/api/movies/top-rated" },
  { key: "upcoming", label: "Coming Soon", endpoint: "/api/movies/upcoming" },
] as const;

export default function HomePage() {
  const [categories, setCategories] = useState<Record<string, Movie[]>>({});
  const [activeTab, setActiveTab] = useState("now_playing");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/movies/static');
        const allMovies = await res.json();
        const results: Record<string, Movie[]> = {};
        // Simulate categories by sorting differently
        results['now_playing'] = allMovies.slice(0, 12);
        results['top_rated'] = [...allMovies].sort((a: any, b: any) => b.vote_average - a.vote_average).slice(0, 12);
        results['upcoming'] = [...allMovies].sort((a: any, b: any) => b.popularity - a.popularity).slice(0, 12);
        setCategories(results);
      } catch {
        setCategories({});
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch('/api/movies/static');
      const allMovies = await res.json();
      const lower = q.toLowerCase();
      const results = allMovies.filter((m: any) => m.title.toLowerCase().includes(lower));
      setSearchResults(results.slice(0, 12));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  const activeMovies = search
    ? searchResults
    : categories[CATEGORIES.find(c => c.key === activeTab)?.key || "now_playing"] || [];

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
              placeholder="Cari film..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </header>

      {/* Hero banner ad */}
      <AdBanner slot="top" className="max-w-7xl mx-auto px-4 mt-4" />

      {/* Category tabs */}
      {!search && (
        <nav className="max-w-7xl mx-auto px-4 mt-6 flex gap-1 p-1 bg-secondary/50 rounded-full w-fit">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === cat.key
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      )}

      {/* Movie grid */}
      <main className="max-w-7xl mx-auto px-4 mt-6 pb-16">
        {search && (
          <h2 className="text-lg font-semibold mb-4">
            Hasil pencarian: "{search}"
          </h2>
        )}

        {loading || searching ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activeMovies.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Tidak ada film ditemukan</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {activeMovies.map(movie => (
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
