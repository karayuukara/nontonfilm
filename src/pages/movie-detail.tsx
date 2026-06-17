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

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [trailer, setTrailer] = useState<VideoResult | null>(null);
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
          setMovie(found);
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

        {/* Mid Ad */}
        <AdBanner slot="mid" className="my-8" />

        {/* Trailer / Watch section with ads */}
        {trailer && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Trailer</h2>
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=0&rel=0`}
                allowFullScreen
                className="absolute inset-0 w-full h-full"
                title={trailer.name}
              />
            </div>

            {/* Ads around trailer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {/* Ad sidebar - left */}
              <div className="hidden md:block">
                <AdBanner slot="mid" />
              </div>

              {/* Ad sidebar - right */}
              <div className="hidden md:block">
                <AdBanner slot="mid" />
              </div>
            </div>
          </div>
        )}

        {/* Bottom Ad */}
        <AdBanner slot="bottom" className="mt-8 mb-12" />
      </div>
    </div>
  );
}
