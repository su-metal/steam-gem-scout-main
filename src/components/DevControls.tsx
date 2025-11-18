import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function DevControls() {
  // Only render in development
  if (import.meta.env.PROD) return null;

  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const { toast } = useToast();

  const handleRefreshRankings = async () => {
    setLoadingRefresh(true);
    try {
      const response = await fetch("/functions/v1/get-rankings");
      
      if (response.ok) {
        toast({
          title: "Rankings Refreshed",
          description: "Game rankings cache has been updated",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to refresh rankings",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh rankings",
        variant: "destructive",
      });
    } finally {
      setLoadingRefresh(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 p-3 bg-card border rounded-lg shadow-lg">
      <div className="text-xs font-semibold text-muted-foreground mb-1">
        Dev Controls
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRefreshRankings}
        disabled={loadingRefresh}
        className="text-xs"
      >
        {loadingRefresh && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
        Refresh Rankings
      </Button>
    </div>
  );
}
