export async function cancelRecurring(
  recurringId: string,
  caller: string,
) {
  return contract.cancelRecurring({
    recurringId,
    caller,
  });
}

export async function pauseRecurring(
  recurringId: string,
  caller: string,
) {
  return contract.pauseRecurring({
    recurringId,
    caller,
  });
}

export async function resumeRecurring(
  recurringId: string,
  caller: string,
) {
  return contract.resumeRecurring({
    recurringId,
    caller,
  });
}

export async function amendRecurring(
  recurringId: string,
  caller: string,
  amendments: AmendRecurringInput,
) {
  return contract.amendRecurring({
    recurringId,
    caller,
    ...amendments,
  });
}
