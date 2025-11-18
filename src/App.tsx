import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DevControls } from "@/components/DevControls";
import Index from "./pages/Index";
import Rankings from "./pages/Rankings";
import GameDetail from "./pages/GameDetail";
import Wishlist from "./pages/Wishlist";
import NotFound from "./pages/NotFound";

import { ImportSteamGamesPage } from "./pages/ImportSteamGamesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DevControls />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/search" element={<Rankings />} />
          <Route path="/game/:appId" element={<GameDetail />} />
          <Route path="/wishlist" element={<Wishlist />} />

          <Route path="/admin/import-steam" element={<ImportSteamGamesPage />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
