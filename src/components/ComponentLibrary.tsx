import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Box, Circle, Zap, Grid3x3, Settings, ChevronLeft, ChevronRight } from "lucide-react";

type BackendComponent = {
  id: number;
  name: string;
  category_label?: string;
  category?: string;
  type?: string;
  glb_url?: string | null;
  original_url?: string | null;
  bounding_box?: any;
  center?: any;
};

interface ComponentLibraryProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ComponentLibrary = ({ collapsed = false, onToggleCollapse }: ComponentLibraryProps) => {
  const [items, setItems] = useState<BackendComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/components/`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const results = Array.isArray(data) ? data : data.results || [];
        setItems(results);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const iconForCategory = (label?: string) => {
    switch ((label || "").toLowerCase()) {
      case "motor":
        return Zap;
      case "roller":
        return Circle;
      case "belt":
        return Grid3x3;
      case "frame":
      case "base":
        return Box;
      default:
        return Settings;
    }
  };

  return (
    <div className={`panel-glass h-full flex flex-col transition-all ${collapsed ? 'w-12' : 'w-80'}`}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className={collapsed ? 'hidden' : ''}>
          <h2 className="font-semibold text-lg">Component Library</h2>
          <p className="text-sm text-muted-foreground mt-1">Drag to add to scene</p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggleCollapse}
          className="shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className={`p-4 space-y-2 ${collapsed ? 'hidden' : ''}`}>
          {loading && <div className="text-xs text-muted-foreground">Loading components…</div>}
          {error && <div className="text-xs text-red-500">{error}</div>}
          {!loading && !error && items.map((component) => {
            const category = component.category || component.category_label || component.type || "";
            const Icon = iconForCategory(category);
            return (
              <Card 
                key={component.id}
                className="p-3 cursor-move hover:bg-secondary transition-smooth hover:border-primary"
                draggable
                onDragStart={(e) => {
                  // Ensure URLs are absolute
                  let glbUrl = component.glb_url;
                  let originalUrl = component.original_url;
                  
                  if (glbUrl && !glbUrl.startsWith('http')) {
                    glbUrl = `${API_BASE}${glbUrl.startsWith('/') ? glbUrl : '/' + glbUrl}`;
                  }
                  
                  if (originalUrl && !originalUrl.startsWith('http')) {
                    originalUrl = `${API_BASE}${originalUrl.startsWith('/') ? originalUrl : '/' + originalUrl}`;
                  }
                  
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    id: component.id,
                    name: component.name,
                    category: category,
                    glb_url: glbUrl,
                    original_url: originalUrl,
                    bounding_box: component.bounding_box,
                    center: component.center,
                  }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">{component.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {category}
                      </Badge>
                    </div>
                    {component.glb_url && (
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">GLB ready</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
