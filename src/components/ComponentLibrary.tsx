import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEffect, useMemo, useState } from "react";
import { Box, Circle, Zap, Grid3x3, Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { ComponentLibraryPreview } from "@/components/ComponentLibraryPreview";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { API_BASE } from '@/lib/config';

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
      case "conveyor":
        return Grid3x3;
      case "frame":
      case "base":
        return Box;
      default:
        return Settings;
    }
  };

  // Group components by category
  const groupedComponents = useMemo(() => {
    const groups: Record<string, BackendComponent[]> = {};
    
    items.forEach((component) => {
      const category = component.category || component.category_label || component.type || "Uncategorized";
      const normalizedCategory = category.trim() || "Uncategorized";
      
      if (!groups[normalizedCategory]) {
        groups[normalizedCategory] = [];
      }
      groups[normalizedCategory].push(component);
    });
    
    // Sort categories alphabetically, but put "Uncategorized" at the end
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
    
    return { groups, sortedCategories };
  }, [items]);

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
      
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        <div className={`p-4 ${collapsed ? 'hidden' : ''}`}>
          {loading && <div className="text-xs text-muted-foreground">Loading components…</div>}
          {error && <div className="text-xs text-red-500">{error}</div>}
          {!loading && !error && (
            <Accordion type="multiple" defaultValue={groupedComponents.sortedCategories} className="w-full">
              {groupedComponents.sortedCategories.map((category, categoryIndex) => {
                const categoryComponents = groupedComponents.groups[category];
                const Icon = iconForCategory(category);
                
                return (
                  <div key={category}>
                    {categoryIndex > 0 && <Separator className="my-2" />}
                    <AccordionItem value={category} className="border-none">
                      <AccordionTrigger className="py-2 hover:no-underline">
                        <div className="flex items-center gap-2 flex-1">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{category}</span>
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {categoryComponents.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-4">
                        <div className="space-y-2">
                        {categoryComponents.map((component, componentIndex) => {
                          const componentCategory = component.category || component.category_label || component.type || "";
                          const ComponentIcon = iconForCategory(componentCategory);
                          return (
                            <div key={component.id}>
                              {componentIndex > 0 && <Separator className="my-2" />}
                              <Card 
                              key={component.id}
                              className="p-3 cursor-move hover:bg-secondary transition-smooth hover:border-primary overflow-visible"
                              draggable={true}
                onDragStart={(e) => {
                  try {
                    // Ensure URLs are absolute
                    let glbUrl = component.glb_url || null;
                    let originalUrl = component.original_url || null;
                    
                    if (glbUrl && !glbUrl.startsWith('http')) {
                      glbUrl = `${API_BASE}${glbUrl.startsWith('/') ? glbUrl : '/' + glbUrl}`;
                    }
                    
                    if (originalUrl && !originalUrl.startsWith('http')) {
                      originalUrl = `${API_BASE}${originalUrl.startsWith('/') ? originalUrl : '/' + originalUrl}`;
                    }
                    
                    // Normalize bounding_box format if it exists
                    let normalizedBoundingBox = component.bounding_box || null;
                    if (normalizedBoundingBox) {
                      // Check if it's in the correct format {min: [x,y,z], max: [x,y,z]}
                      if (normalizedBoundingBox.min && normalizedBoundingBox.max && 
                          Array.isArray(normalizedBoundingBox.min) && Array.isArray(normalizedBoundingBox.max)) {
                        // Format is correct, use as-is
                      } else if (normalizedBoundingBox.x && normalizedBoundingBox.y && normalizedBoundingBox.z) {
                        // Convert from {x: {min, max}, y: {min, max}, z: {min, max}} format
                        normalizedBoundingBox = {
                          min: [normalizedBoundingBox.x.min || 0, normalizedBoundingBox.y.min || 0, normalizedBoundingBox.z.min || 0],
                          max: [normalizedBoundingBox.x.max || 0, normalizedBoundingBox.y.max || 0, normalizedBoundingBox.z.max || 0],
                        };
                      } else {
                        // Invalid format, treat as missing
                        normalizedBoundingBox = null;
                      }
                    }
                    
                    // Ensure all required fields are present with defaults
                    const dragData = {
                      id: component.id,
                      name: component.name || 'Unnamed Component',
                      category: componentCategory || 'unknown',
                      glb_url: glbUrl,
                      original_url: originalUrl,
                      bounding_box: normalizedBoundingBox,
                      center: component.center || [0, 0, 0],
                    };
                    
                    // Set data in multiple formats for better compatibility
                    const dataString = JSON.stringify(dragData);
                    e.dataTransfer.setData('application/json', dataString);
                    e.dataTransfer.setData('text/plain', dataString);
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.dropEffect = 'copy';
                    
                    // Store component type in a custom format that can be read during dragOver
                    // Use types array to store component category/name for detection
                    const componentName = (component.name || '').toLowerCase();
                    const isFixedLeg = [componentName, componentCategory].some((s) =>
                      s.includes('leg') || s.includes('support') || s.includes('stand')
                    );
                    
                    window.dispatchEvent(new CustomEvent('componentDragStart', { 
                      detail: { component: dragData, isFixedLeg }
                    }));
                    
                    // Create custom drag image from the 3D preview canvas
                    // Note: setDragImage must be called synchronously during dragStart
                    try {
                      // Find the canvas element in the preview
                      const cardElement = e.currentTarget;
                      const sourceCanvas = cardElement.querySelector('canvas') as HTMLCanvasElement;
                      
                      if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
                        // Create a new canvas for the drag preview
                        const dragCanvas = document.createElement('canvas');
                        dragCanvas.width = 128;
                        dragCanvas.height = 128;
                        const ctx = dragCanvas.getContext('2d', { willReadFrequently: false });
                        
                        if (ctx) {
                          // Draw semi-transparent dark background
                          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                          ctx.fillRect(0, 0, 128, 128);
                          
                          // Draw border with accent color
                          ctx.strokeStyle = 'rgba(0, 180, 216, 0.6)';
                          ctx.lineWidth = 2;
                          ctx.strokeRect(1, 1, 126, 126);
                          
                          // Draw the 3D model from source canvas, scaled and centered
                          const padding = 10;
                          const drawWidth = 128 - (padding * 2);
                          const drawHeight = 128 - (padding * 2);
                          
                          // Use high-quality scaling
                          ctx.imageSmoothingEnabled = true;
                          ctx.imageSmoothingQuality = 'high';
                          
                          // Draw the canvas content
                          ctx.drawImage(
                            sourceCanvas,
                            0,
                            0,
                            sourceCanvas.width,
                            sourceCanvas.height,
                            padding,
                            padding,
                            drawWidth,
                            drawHeight
                          );
                          
                          // Create a wrapper div to hold the canvas (some browsers need an element, not canvas directly)
                          const dragImageWrapper = document.createElement('div');
                          dragImageWrapper.style.width = '128px';
                          dragImageWrapper.style.height = '128px';
                          dragImageWrapper.style.position = 'absolute';
                          dragImageWrapper.style.top = '-2000px';
                          dragImageWrapper.style.left = '-2000px';
                          dragImageWrapper.style.pointerEvents = 'none';
                          dragImageWrapper.appendChild(dragCanvas);
                          
                          // Append to body (required for setDragImage to work)
                          document.body.appendChild(dragImageWrapper);
                          
                          // Set drag image - use the wrapper div
                          e.dataTransfer.setDragImage(dragImageWrapper, 64, 64);
                          
                          // Clean up after drag operation completes
                          const cleanup = () => {
                            setTimeout(() => {
                              if (dragImageWrapper.parentNode) {
                                document.body.removeChild(dragImageWrapper);
                              }
                            }, 100);
                          };
                          
                          // Clean up on drag end
                          cardElement.addEventListener('dragend', cleanup, { once: true });
                        }
                      }
                    } catch (dragImageError) {
                      console.warn('Could not create custom drag image:', dragImageError);
                      // Continue with default drag image if custom one fails
                    }
                    
                    console.log('🚀 Drag data set, types:', e.dataTransfer.types);
                  } catch (error) {
                    console.error('❌ Error setting drag data:', error);
                    // Still allow drag even if data setting fails
                    e.dataTransfer.effectAllowed = 'copy';
                  }
                }}
                onDragEnd={(e) => {
                  // Clean up any drag-related state
                  e.dataTransfer.clearData();
                }}
              >
                <div className="space-y-3" style={{ pointerEvents: 'auto' }}>
                  {/* 3D Preview */}
                  <div 
                    style={{ 
                      pointerEvents: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none'
                    }}
                  >
                    <ComponentLibraryPreview 
                      glbUrl={(() => {
                        // Format GLB URL to be absolute if needed
                        let url = component.glb_url || null;
                        if (url && !url.startsWith('http')) {
                          url = `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
                        }
                        return url;
                      })()}
                      originalUrl={(() => {
                        // Format original URL to be absolute if needed
                        let url = component.original_url || null;
                        if (url && !url.startsWith('http')) {
                          url = `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
                        }
                        return url;
                      })()}
                      category={componentCategory}
                      apiBase={API_BASE}
                    />
                  </div>
                  
                  {/* Component Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <ComponentIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-sm truncate">{component.name}</h3>
                      </div>
                      {component.glb_url && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">GLB ready</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  </div>
                );
              })}
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
};
