import { Reveal } from "@/components/Reveal";
import { CreateStrategyForm } from "@/components/CreateStrategyForm";

export default function NewStrategyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Reveal>
        <h1 className="text-2xl font-bold tracking-tight">Be a Lead Trader</h1>
        <p className="mt-2 text-sm text-muted">
          Post a momentum-breakout setup — an entry zone, a target, a stop. Anyone who follows it sets their own
          risk limits, and only copies the entry while your exact setup is still reproducible on live Kuru depth.
          You earn 10% of followers&apos; realized profit, nothing on losses.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <CreateStrategyForm />
      </Reveal>
    </div>
  );
}
