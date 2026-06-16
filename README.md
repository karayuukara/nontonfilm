# NontonFilm — Situs Katalog Film + Monetisasi Iklan

Situs katalog film yang menampilkan data dari [TMDB API](https://developer.themoviedb.org/). Modelnya ad-arbitrage: traffic dari pencarian film dimonetisasi lewat iklan (Adsterra, PopCash, AliExpress affiliate, dsb).

**Tech Stack:** Bun + Hono + React 19 + React Router 7 + Vite + Tailwind CSS 4 + shadcn/ui

## Struktur

```
nontonfilm/
├── server.ts              # Hono server + TMDB API proxy
├── src/
│   ├── App.tsx            # Router (BrowserRouter)
│   ├── main.tsx           # Entry point
│   ├── styles.css         # Tailwind + shadcn theme (dark default)
│   ├── lib/
│   │   └── tmdb.ts        # TMDB types, helpers, poster URL builder
│   ├── components/
│   │   ├── movie-card.tsx # Kartu film (poster, rating, tahun)
│   │   └── ad-banner.tsx  # Slot iklan + popunder script
│   └── pages/
│       ├── home.tsx       # Homepage: Now Playing, Top Rated, Upcoming
│       └── movie-detail.tsx # Detail film + iklan penuh
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts
└── zosite.json
```

## Cara Setup

### 1. Dapetin TMDB API Key (Gratis)
- Daftar di https://www.themoviedb.org/signup
- Buka https://www.themoviedb.org/settings/api
- Pilih "Developer" — isi form sederhana (nama app: "NontonFilm", URL: isi aja, deskripsi: "Movie catalog")
- Copy **API Read Access Token (v4 auth)** — formatnya `Bearer eyJ...`

### 2. Set Environment Variables
Edit `zosite.json`, tambahin di `env` (untuk development) dan `publish.env` (untuk production):

```json
{
  "env": {
    "TMDB_API_KEY": "Bearer eyJ...token lu...",
    "AD_CODE_TOP": "",
    "AD_CODE_MID": "",
    "AD_CODE_BOTTOM": "",
    "POPUNDER_URL": ""
  }
}
```

### 3. Setup Iklan (Dapetin Duit)

**Opsi iklan yang bisa dipake:**

| Jaringan | Jenis | Minimum Payout | Syarat |
|----------|-------|----------------|--------|
| [Adsterra](https://adsterra.com) | Banner + Popunder | $5 (crypto) | Situs baru oke |
| [PopCash](https://popcash.net) | Popunder | $10 | Situs baru oke |
| [AliExpress Affiliate](https://portals.aliexpress.com) | Affiliate link | $16 | Traffic organik |
| [AdMaven](https://admafia.io) | Popunder | $50 | Situs baru oke |

**Cara pasang:**
1. Daftar di jaringan iklan pilihan
2. Copy kode iklan (script tag)
3. Set environment variable sesuai slot:
   - `AD_CODE_TOP` → Banner di atas homepage
   - `AD_CODE_MID` → Banner di tengah homepage  
   - `AD_CODE_BOTTOM` → Banner di bawah homepage
   - `POPUNDER_URL` → URL popunder (dari Adsterra/PopCash)

### 4. Publish ke Domain Custom
```bash
# Publish (URL publik: *.zocomputer.io)
publish_site("/home/workspace/nontonfilm", public="true")

# Untuk custom domain: buka hosting settings & tambahin domain lu
```

## API Endpoints (Proxy TMDB)
Semua endpoint ini aman — API key cuma ada di server, nggak kelihatan di frontend.

- `GET /api/movies/now-playing?page=1`
- `GET /api/movies/top-rated?page=1`
- `GET /api/movies/upcoming?page=1`
- `GET /api/movies/search?q=batman&page=1`
- `GET /api/movie/:id`
- `GET /api/movie/:id/videos`

## Project Notes
- Dark theme default (`defaultTheme="dark"` di App.tsx)
- Data film semua dari TMDB — bukan film bajakan, nggak ada copyright issue
- Iklan bisa dikonfigur lewat env vars tanpa edit kode
- Poster film dari `image.tmdb.org` (hotlink legal)
- Nggak ada autentikasi user — pure static-like browsing experience
