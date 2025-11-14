import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface WorkflowStepProps {
  step: number;
  icon: LucideIcon;
  title: string;
  description: string;
  delay?: number;
}

export const WorkflowStep = ({ step, icon: Icon, title, description, delay = 0 }: WorkflowStepProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="flex gap-6 items-start"
    >
      <div className="flex-shrink-0">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 border-2 border-accent text-accent font-bold text-lg">
          {step}
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-accent" />
          <h3 className="text-xl font-bold">{title}</h3>
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
};

