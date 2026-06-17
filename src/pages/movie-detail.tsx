import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Clock, Globe, Film, Play } from "lucide-react";
import { AdBanner, PopunderAd } from "@/components/ad-banner";
import { posterUrl, backdropUrl } from "@/lib/tmdb";

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
};

interface MovieServer {
  name: string;
  url: (id: string, imdbId: string | null) => string;
}

const MOVIE_SERVERS: MovieServer[] = [
  {
    name: "VidSrc",
    url: (id, imdb) => {
      return imdb
        ? `https://vidsrc.to/embed/movie/${imdb}`
        : `https://vidsrc.to/embed/movie/tmdb/${id}`;
    },
  },
  {
    name: "2Embed",
    url: (id, imdb) => {
      return imdb
        ? `https://www.2embed.cc/embed/${imdb}`
        : `https://www.2embed.cc/embed/tmdb/${id}`;
    },
  },
  {
    name: "VidSrc CC",
    url: (id, imdb) => {
      return `https://vidsrc.cc/v2/embed/movie/${id}`;
    },
  },
];

interface MovieData {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genres: { id: number; name: string }[];
  genre_ids?: number[];
  runtime: number;
  tagline: string;
  imdb_id: string | null;
  original_language?: string;
}

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [activeServer, setActiveServer] = useState(1); // MOVIE_SERVERS index (default: 2Embed)

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    // Try live API first (scrapes TMDB website)
    fetch(`/api/movie/${id}`)
      .then(r => r.json())
      .then((data) => {
        if (data && !data.error && data.title) {
          const movieData = normalizeMovie(data);
          setMovie(movieData);
        } else {
          // Fallback to static
          return fetch("/api/movies/static")
            .then(r => r.json())
            .then((all) => {
              const found = all.find((m: any) => m.id === parseInt(id || "0"));
              if (found) setMovie(normalizeMovie(found));
            });
        }
      })
      .catch(() => {
        // Fallback to static
        fetch("/api/movies/static")
          .then(r => r.json())
          .then((all) => {
            const found = all.find((m: any) => m.id === parseInt(id || "0"));
            if (found) setMovie(normalizeMovie(found));
          })
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [id]);

  function normalizeMovie(data: any): MovieData {
    const genres = data.genres?.length
      ? data.genres
      : (data.genre_ids || []).map((gid: number) => ({
          id: gid,
          name: GENRE_MAP[gid] || "Unknown",
        }));

    return {
      id: data.id,
      title: data.title || "Unknown",
      overview: data.overview || "",
      poster_path: data.poster_path || null,
      backdrop_path: data.backdrop_path || null,
      release_date: data.release_date || "",
      vote_average: data.vote_average || 0,
      vote_count: data.vote_count || 0,
      genres,
      runtime: data.runtime || 0,
      tagline: data.tagline || "",
      imdb_id: data.imdb_id || null,
      original_language: data.original_language || "en",
    };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mb-6" />
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-64 aspect-[2/3] bg-muted rounded-lg shrink-0 mx-auto md:mx-0" />
              <div className="flex-1 space-y-4">
                <div className="h-8 w-3/4 bg-muted rounded" />
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-20 w-full bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Film className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Film tidak ditemukan</h2>
          <p className="text-muted-foreground mb-4">Coba refresh atau cari film lain</p>
          <button onClick={() => navigate("/")} className="text-primary hover:underline">
            Kembali ke beranda
          </button>
        </div>
      </div>
    );
  }

  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA";
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : "N/A";
  const poster = posterUrl(movie.poster_path, "w500");
  const lang = (movie.original_language || "en").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PopunderAd />

      {movie.backdrop_path && (
        <div className="relative h-[300px] md:h-[400px] overflow-hidden">
          <img
            src={backdropUrl(movie.backdrop_path, "w1280")}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
      )}

      <div className={`max-w-5xl mx-auto px-4 ${movie.backdrop_path ? "-mt-32" : "pt-8"} relative z-10`}>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="shrink-0 mx-auto md:mx-0">
            <img
              src={poster}
              alt={movie.title}
              className="w-64 rounded-lg shadow-2xl"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="384" fill="%23333"><rect width="256" height="384"/><text fill="%23666" font-size="40" text-anchor="middle" x="128" y="200">🎬</text></svg>`
                  );
              }}
            />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{movie.title}</h1>
              {movie.tagline && <p className="text-muted-foreground italic mt-1">{movie.tagline}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {movie.vote_average > 0 && (
                <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-md">
                  <Star className="w-4 h-4 fill-current" />
                  {movie.vote_average.toFixed(1)}
                  {movie.vote_count > 0 && ` (${movie.vote_count.toLocaleString()} suara)`}
                </span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-4 h-4" /> {runtime}
              </span>
              <span className="text-muted-foreground">{year}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="w-4 h-4" /> {lang}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {movie.genres.map((g) => (
                <span key={g.id} className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
                  {g.name}
                </span>
              ))}
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Sinopsis</h3>
              <p className="text-muted-foreground leading-relaxed">
                {movie.overview || "Tidak ada sinopsis tersedia."}
              </p>
            </div>
          </div>
        </div>

        {/* Player Section */}
        <div className="mt-8">
          {!showPlayer ? (
            <div
              className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center cursor-pointer group"
              onClick={() => setShowPlayer(true)}
            >
              {movie.backdrop_path ? (
                <img
                  src={backdropUrl(movie.backdrop_path, "w1280")}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-red-900/60 to-black" />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-600/90 flex items-center justify-center group-hover:bg-red-500 transition-all group-hover:scale-110 shadow-lg shadow-red-500/30">
                  <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-white ml-1" />
                </div>
                <span className="text-white font-semibold text-lg">Tonton Sekarang</span>
                <span className="text-white/50 text-xs">Klik untuk memutar film</span>
              </div>
            </div>
          ) : (
            <div>
              {/* Ad above player */}
              <AdBanner slot="top" className="mb-3" />

              {/* Server selector */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Server:</span>
                {MOVIE_SERVERS.map((s, i) => (
                  <button
                    key={s.name}
                    onClick={() => setActiveServer(i)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeServer === i
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Player iframe */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black shadow-2xl shadow-red-500/10">
                <iframe
                  key={`${activeServer}-${id}`}
                  src={MOVIE_SERVERS[activeServer].url(id!, movie.imdb_id)}
                  allowFullScreen
                  allow="autoplay; fullscreen"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  className="absolute inset-0 w-full h-full"
                  title={`Nonton ${movie.title}`}
                />
              </div>

              {/* Ad below player */}
              <AdBanner slot="bottom" className="mt-3 mb-8" />

              <p className="text-xs text-muted-foreground text-center mt-2">
                Video disediakan oleh pihak ketiga. Ganti server di atas jika video tidak muncul.
              </p>
            </div>
          )}
        </div>

        <AdBanner slot="mid" className="my-8" />
      </div>
    </div>
  );
}
