import { motion } from "framer-motion";

const LOGOS = [
  { name: "TechManufacturing", id: 1 },
  { name: "Industrial Solutions", id: 2 },
  { name: "Automation Systems", id: 3 },
  { name: "Conveyor Pro", id: 4 },
  { name: "Factory Design Co", id: 5 },
];

export const SocialProof = () => {
  return (
    <section className="py-12 px-4 bg-card/30">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-8">
            Trusted by Industry Leaders
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
            {LOGOS.map((logo, index) => (
              <motion.div
                key={logo.id}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="text-2xl font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                {logo.name}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

