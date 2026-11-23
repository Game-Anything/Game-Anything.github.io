// Seconds on the simulation clock. A dodge can leave an attack once the
// blade has withdrawn. Another attack still waits for the full recovery.
export function recoveryEnd(player, next) {
  if (next !== 'roll' || player.flight || player.airStrike) return player.duration;
  if (player.action === 'roll') return .58;
  if (player.action === 'light') return Math.max(.56, player.duration - .16);
  if (player.action === 'heavy') return player.duration - .20;
  return player.duration;
}

export function queueRecovery(player, name, time, direction) {
  const ready = recoveryEnd(player, name);
  const remaining = Math.max(0, ready - player.elapsed);
  // Accept the next press as the blade extends into contact. The second
  // thrust still begins after full recovery, including on a miss.
  const nearContact = !player.runningThrust && player.elapsed >= .20;
  const followup = name === 'light' && player.action === 'light' && (nearContact || player.thrustCommitted || player.attackDone) && !player.flight && !player.airStrike;
  const withdrawing=name==='roll'&&player.action==='light'&&player.elapsed>=.24;
  const window=followup?.52:withdrawing?.34:.28;
  if (!(player.duration > 0) || remaining > window + 1e-8) return false;
  if (player.buffer && player.buffer.until < time) player.buffer=null;
  // Once a dodge is requested, repeated attack presses cannot displace it.
  if (player.buffer?.name === 'roll' && name !== 'roll') return false;
  player.buffer = {name, direction, until: time + remaining + .10};
  return true;
}

export function canLeaveForDodge(player, stamina, time) {
  const next=player.buffer;
  if (next?.name !== 'roll' || time > next.until) return false;
  const cost=next.direction?.lengthSq() ? 17 : 12;
  return stamina >= cost && player.elapsed >= recoveryEnd(player, 'roll');
}

// Translate the actor during the planted thrust. Sampling cumulative travel
// at both ends of a tick preserves the lunge length at any frame rate.
export function thrustTravel(elapsed, contact, windup, approachSpeed = 0) {
  const t=Math.min(1, Math.max(0, (elapsed - windup) / (contact - windup)));
  // A running thrust carries its incoming stride until the front foot plants.
  // Integrating the decelerating approach makes the distance independent of tick rate.
  const lead = Math.max(0, Math.min(elapsed, windup));
  const coast = windup > 0 ? Math.max(0, approachSpeed) * lead * (1 - .5 * lead / windup) : 0;
  return coast + .48 * t*t * (3 - 2*t);
}
