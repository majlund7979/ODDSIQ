import { Planned } from "@/components/Planned";

export const metadata = { title: "Live Markets · ODDSIQ" };

export default function LivePage() {
  return (
    <Planned title="Live Markets" phase={7}>
      <p>Three-pane live terminal: live matches on the left, the selected market chart in the centre and AI market intelligence on the right, with model and market probability movement tied to the event timeline. In-play examples are already visible from the Dashboard and the Market Terminal.</p>
    </Planned>
  );
}
