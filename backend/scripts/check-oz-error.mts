import { ethers } from "ethers";
const candidates = [
  "error OwnableUnauthorizedAccount(address account)",
  "error Unauthorized()",
  "error OnlyOwner()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
];
for (const sig of candidates) {
  const iface = new ethers.utils.Interface([sig]);
  const name = sig.match(/error (\w+)/)![1];
  const fragment = iface.getError(name);
  console.log(iface.getSighash(fragment), sig);
}
