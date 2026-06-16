import { Film, Star } from "lucide-react";
import type { Movie } from "@/lib/tmdb";
import { posterUrl } from "@/lib/tmdb";

export function MovieCard({ movie }: { movie: Movie }) {
  return (
    <a
      href={`/movie/${movie.id}`}
      className="group block rounded-lg overflow-hidden bg-card border border-border hover:border-primary/50 transition-all hover:scale-[1.02]"
    >
      <div className="aspect-[2/3] relative bg-muted overflow-hidden">
        {movie.poster_path ? (
          <img
            src={posterUrl(movie.poster_path, "w342")}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          {movie.vote_average.toFixed(1)}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm truncate">{movie.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA"}
        </p>
      </div>
    </a>
  );
}
