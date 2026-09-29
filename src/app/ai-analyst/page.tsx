import { Planned } from "@/components/Planned";

export const metadata = { title: "AI Analyst · ODDSIQ" };

export default function AiAnalystPage() {
  return (
    <Planned title="AI Analyst" phase={8}>
      <p>Market commentary and a personal market assistant that only use the data supplied on screen, separate known facts from possible explanations, and never make decisions for you.</p>
    </Planned>
  );
}
