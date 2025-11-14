import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Grid3x3, Settings } from "lucide-react";

interface EmptyStateProps {
  onNewProject: () => void;
  onSelectTemplate?: (template: string) => void;
}

const TEMPLATES = [
  { id: "standard", name: "Standard Belt", icon: FileText },
  { id: "heavy-duty", name: "Heavy Duty", icon: Grid3x3 },
  { id: "custom", name: "Custom Setup", icon: Settings },
];

export const EmptyState = ({ onNewProject, onSelectTemplate }: EmptyStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mb-6">
        <Plus className="h-12 w-12 text-accent" />
      </div>
      <h2 className="text-3xl font-bold mb-3">Create your first belt</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        Get started by creating a new project or choose from one of our templates.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-12">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <motion.button
              key={template.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelectTemplate?.(template.id)}
              className="p-6 rounded-xl bg-card border border-border hover:border-accent transition-all text-left"
            >
              <Icon className="h-6 w-6 text-accent mb-3" />
              <h3 className="font-semibold mb-1">{template.name}</h3>
              <p className="text-sm text-muted-foreground">Start with a template</p>
            </motion.button>
          );
        })}
      </div>

      <Button size="lg" onClick={onNewProject} className="bg-accent text-accent-foreground hover:bg-accent/90">
        <Plus className="mr-2 h-5 w-5" />
        New Project
      </Button>
    </motion.div>
  );
};

