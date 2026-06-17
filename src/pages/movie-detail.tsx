import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Clock, Globe, DollarSign, Film, Play } from "lucide-react";
import { AdBanner, PopunderAd } from "@/components/ad-banner";
import type { MovieDetail } from "@/lib/tmdb";
import { posterUrl, backdropUrl } from "@/lib/tmdb";

interface VideoResult {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
};

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [trailer, setTrailer] = useState<VideoResult | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // Try static data first (no API key needed)
    fetch('/api/movies/static')
      .then(r => r.json())
      .then((allMovies) => {
        const movieId = parseInt(id);
        const found = allMovies.find((m: any) => m.id === movieId);
        if (found) {
          // Convert genre_ids to genres objects
          const movieData = {
            ...found,
            genres: (found.genre_ids || []).map((gid: number) => ({
              id: gid,
              name: GENRE_MAP[gid] || "Unknown",
            })),
            runtime: found.runtime || 0,
            budget: found.budget || 0,
            revenue: found.revenue || 0,
            tagline: found.tagline || "",
            vote_count: found.vote_count || 0,
          };
          setMovie(movieData);
          setTrailer(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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
          <button
            onClick={() => navigate("/")}
            className="text-primary hover:underline"
          >
            Kembali ke beranda
          </button>
        </div>
      </div>
    );
  }

  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA";
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : "N/A";
  const poster = posterUrl(movie.poster_path, "w500");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PopunderAd />

      {/* Backdrop hero */}
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

      <div className="max-w-5xl mx-auto px-4 -mt-32 relative z-10">
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="shrink-0 mx-auto md:mx-0">
            <img
              src={poster}
              alt={movie.title}
              className="w-64 rounded-lg shadow-2xl"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "data:image/svg+xml," + encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="384" fill="%23333"><rect width="256" height="384"/><text fill="%23666" font-size="40" text-anchor="middle" x="128" y="200">🎬</text></svg>`
                );
              }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{movie.title}</h1>
              {movie.tagline && (
                <p className="text-muted-foreground italic mt-1">{movie.tagline}</p>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-md">
                <Star className="w-4 h-4 fill-current" />
                {movie.vote_average.toFixed(1)} ({movie.vote_count.toLocaleString()} suara)
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-4 h-4" /> {runtime}
              </span>
              <span className="text-muted-foreground">{year}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="w-4 h-4" /> {movie.original_language.toUpperCase()}
              </span>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2">
              {movie.genres.map(g => (
                <span key={g.id} className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
                  {g.name}
                </span>
              ))}
            </div>

            {/* Overview */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Sinopsis</h3>
              <p className="text-muted-foreground leading-relaxed">
                {movie.overview || "Tidak ada sinopsis tersedia."}
              </p>
            </div>

            {/* Budget / Revenue */}
            <div className="flex gap-6 text-sm">
              {movie.budget > 0 && (
                <div>
                  <span className="text-muted-foreground">Budget</span>
                  <p className="font-semibold">${(movie.budget / 1_000_000).toFixed(0)}M</p>
                </div>
              )}
              {movie.revenue > 0 && (
                <div>
                  <span className="text-muted-foreground">Revenue</span>
                  <p className="font-semibold">${(movie.revenue / 1_000_000).toFixed(0)}M</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Watch Now Section */}
        <div className="mt-8">
          {!showPlayer ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center cursor-pointer group"
                 onClick={() => setShowPlayer(true)}>
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
              {/* Top ad before player */}
              <AdBanner slot="top" className="mb-3" />

              <div className="relative aspect-video rounded-lg overflow-hidden bg-black shadow-2xl shadow-red-500/10">
                <iframe
                  src={`https://vidsrc.to/embed/movie/tmdb/${id}`}
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  title={`Nonton ${movie.title}`}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>

              {/* Bottom ad after player */}
              <AdBanner slot="bottom" className="mt-3 mb-8" />

              <p className="text-xs text-muted-foreground text-center mt-2">
                Video disediakan oleh penyedia pihak ketiga. Jika tidak muncul, coba refresh halaman.
              </p>
            </div>
          )}
        </div>

        {/* Mid Ad */}
        <AdBanner slot="mid" className="my-8" />
      </div>
    </div>
  );
}
