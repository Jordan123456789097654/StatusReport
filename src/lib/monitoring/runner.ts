import { httpCheck } from "./http";
import { dnsCheck, domainCheck, pingCheck, sslCheck, tcpCheck, udpCheck } from "./protocols";
import { down, type CheckOutcome, type MonitorRow } from "./types";
import { friendlyError } from "./netguard";

/** Runs one check for a monitor and applies the degraded-latency threshold. */
export async function runCheck(m: MonitorRow): Promise<CheckOutcome> {
  let outcome: CheckOutcome;
  try {
    switch (m.type) {
      case "http":
      case "keyword":
      case "json":
        outcome = await httpCheck(m);
        break;
      case "tcp":
        outcome = await tcpCheck(m);
        break;
      case "udp":
        outcome = await udpCheck(m);
        break;
      case "ping":
        outcome = await pingCheck(m);
        break;
      case "dns":
        outcome = await dnsCheck(m);
        break;
      case "ssl":
        outcome = await sslCheck(m);
        break;
      case "domain":
        outcome = await domainCheck(m);
        break;
      default:
        return down(`Monitor type "${m.type}" is not actively checked`);
    }
  } catch (e) {
    outcome = down(friendlyError(e));
  }
  if (outcome.ok && m.degradedThresholdMs && (outcome.latencyMs ?? 0) > m.degradedThresholdMs) {
    outcome = { ...outcome, status: "degraded", error: `Response time ${outcome.latencyMs}ms exceeds ${m.degradedThresholdMs}ms` };
  }
  return outcome;
}
