import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import HomePage from "@/pages/home";
import MovieDetailPage from "@/pages/movie-detail";

function App() {
  return (
    <BrowserRouter>
    <ThemeProvider defaultTheme="dark" storageKey="nontonfilm-theme">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/movie/:id" element={<MovieDetailPage />} />
      </Routes>
    </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;