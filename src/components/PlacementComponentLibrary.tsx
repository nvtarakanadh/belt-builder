import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Square, Radio, Gauge, Circle, Box, ChevronLeft, ChevronRight } from "lucide-react";
import { SlotType } from "@/lib/types";
import { usePlacementStore } from "@/state/store";

interface PlacementComponentLibraryProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const PLACEMENT_COMPONENTS: Array<{
  type: SlotType;
  name: string;
  icon: typeof Zap;
  description: string;
}> = [
  {
    type: "ENGINE_MOUNT",
    name: "Engine",
    icon: Zap,
    description: "Motor/Engine unit",
  },
  {
    type: "STOP_BUTTON",
    name: "Stop Button",
    icon: Square,
    description: "Emergency stop button",
  },
  {
    type: "SENSOR",
    name: "Sensor",
    icon: Radio,
    description: "Proximity sensor",
  },
  {
    type: "SIDE_GUIDE_BRACKET",
    name: "Side Guide",
    icon: Gauge,
    description: "U-shaped side guide",
  },
  {
    type: "WHEEL",
    name: "Wheel",
    icon: Circle,
    description: "Support wheel",
  },
  {
    type: "FRAME_LEG",
    name: "Frame Leg",
    icon: Box,
    description: "Supporting frame leg",
  },
];

export const PlacementComponentLibrary = ({
  collapsed = false,
  onToggleCollapse,
}: PlacementComponentLibraryProps) => {
  const { setDraggingType, draggingType } = usePlacementStore();

  const handleDragStart = (type: SlotType) => {
    setDraggingType(type);
  };

  return (
    <div className={`panel-glass h-full flex flex-col transition-all ${collapsed ? 'w-12' : 'w-80'}`}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className={collapsed ? 'hidden' : ''}>
          <h2 className="font-semibold text-lg">Components</h2>
          <p className="text-sm text-muted-foreground mt-1">Click to place in slots</p>
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
          {PLACEMENT_COMPONENTS.map((component) => {
            const Icon = component.icon;
            const isDragging = draggingType === component.type;

            return (
              <Card
                key={component.type}
                className={`p-3 cursor-pointer hover:bg-secondary transition-smooth hover:border-primary ${
                  isDragging ? 'border-accent bg-accent/10' : ''
                }`}
                onClick={() => handleDragStart(component.type)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleDragStart(component.type);
                  }
                }}
                aria-label={`Place ${component.name}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${isDragging ? 'bg-accent/20' : 'bg-primary/10'}`}>
                    <Icon className={`h-5 w-5 ${isDragging ? 'text-accent' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm">{component.name}</h3>
                      {isDragging && (
                        <Badge variant="outline" className="text-xs bg-accent/20 border-accent">
                          Dragging
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{component.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {draggingType && !collapsed && (
        <div className="p-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            <strong>Dragging:</strong> {PLACEMENT_COMPONENTS.find((c) => c.type === draggingType)?.name}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Move mouse over scene to see valid slots. Press ESC to cancel.
          </p>
        </div>
      )}
    </div>
  );
};

