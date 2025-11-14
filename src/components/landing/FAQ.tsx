import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    question: "What file formats are supported?",
    answer:
      "We support STEP, STL, OBJ, and GLB/GLTF formats. Files are automatically converted to GLB for web visualization.",
  },
  {
    question: "Can I export my designs?",
    answer:
      "Yes! You can export your designs as GLB files, generate Bill of Materials (BOM), and share projects with your team.",
  },
  {
    question: "Is there a limit to the number of components?",
    answer:
      "No, there's no hard limit. However, for optimal performance, we recommend keeping projects under 100 components.",
  },
  {
    question: "Can I collaborate with my team?",
    answer:
      "Currently, projects are individual. Team collaboration features are coming soon!",
  },
  {
    question: "Do I need to install any software?",
    answer:
      "No! Everything runs in your browser. Just sign up and start building.",
  },
];

export const FAQ = () => {
  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-3xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Frequently Asked Questions</h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about our builder.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border border-border rounded-xl px-6 bg-card"
            >
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

