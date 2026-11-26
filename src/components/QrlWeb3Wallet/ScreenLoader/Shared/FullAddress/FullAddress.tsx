/**
 * Renders a QRL address in full, grouped into readable chunks that wrap.
 *
 * WHY A COMPONENT RATHER THAN A HELPER CALL
 * ----------------------------------------
 * SECURITY.md states the rule: an address must be compared in full, because a
 * matching head and tail is not identity — grinding a key until its visible
 * prefix and suffix match a target is vastly cheaper than a real 512-bit
 * collision, which is what makes address poisoning practical.
 *
 * `StringUtil.getSplitAddress` returns the chunks, but every call site then has
 * to render them correctly, and there were two independent ways to get that
 * wrong in this codebase: joining the chunks back into one unbreakable string
 * and then applying a CSS `truncate` (so only the head survived), and hand-rolled
 * `slice(0, n) + "..." + slice(-m)`. Both looked reasonable in review. Centralising
 * the rendering means the rule is enforced by construction: there is nothing at a
 * call site left to get wrong.
 *
 * Do not add a `truncate`, `text-ellipsis`, or fixed-height `overflow-hidden` to
 * this component or its container. Use `min-w-0` on the flex parent instead so the
 * chunks wrap rather than being clipped.
 */

import StringUtil from "@/utilities/stringUtil";

type FullAddressProps = {
  address: string;
  /** Extra classes for the wrapper. Must not introduce clipping. */
  className?: string;
};

const FullAddress = ({ address, className = "" }: FullAddressProps) => {
  const { prefix, addressSplit } = StringUtil.getSplitAddress(address);

  return (
    <span className={`flex flex-wrap gap-x-1 ${className}`.trim()}>
      <span>
        {prefix}
        {addressSplit[0]}
      </span>
      {addressSplit.slice(1).map((part, index) => (
        <span key={`${String(index)}-${part}`}>{part}</span>
      ))}
    </span>
  );
};

export default FullAddress;
