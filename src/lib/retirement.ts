/**
 * Retirement projection engine.
 *
 * Uses monthly compounding for accumulation; nest-egg need from a
 * real-return annuity (inflation-adjusted spending) plus optional SWR check.
 */

export type RetirementInputs = {
  currentAge: number;
  retirementAge: number;
  lifeExpectancyAge: number;

  /** Desired annual spending in retirement, in TODAY's money (cents) */
  desiredAnnualIncomeCents: number;
  currentAnnualIncomeCents: number;
  replacementPercent: number;

  /** Starting portfolio (cents) */
  currentSavingsCents: number;
  monthlyContributionCents: number;
  /** Annual raise on contributions, percent */
  contributionGrowthPercent: number;

  /** Nominal annual returns, percent */
  returnPrePercent: number;
  returnPostPercent: number;
  inflationPercent: number;
  /** Safe withdrawal rate percent (e.g. 4) */
  withdrawalRatePercent: number;

  /** Guaranteed income streams in TODAY's money, annual cents */
  pensionAnnualCents: number;
  otherIncomeAnnualCents: number;

  /** Reduces pre/post returns */
  taxDragPercent: number;
};

export type YearPoint = {
  age: number;
  yearIndex: number;
  phase: "accumulation" | "retirement";
  /** Nominal portfolio value at end of year (cents) */
  portfolioCents: number;
  /** Portfolio in today's purchasing power */
  portfolioTodayCents: number;
  contributionsThisYearCents: number;
  withdrawalThisYearCents: number;
};

export type RetirementResult = {
  yearsToRetirement: number;
  yearsInRetirement: number;

  /** Effective after tax-drag annual rates (decimal) */
  returnPre: number;
  returnPost: number;
  inflation: number;
  realReturnPre: number;
  realReturnPost: number;

  /** Desired spending at retirement in future pesos (first year) */
  desiredIncomeAtRetirementCents: number;
  /** Portfolio draw needed after pensions (today's pesos annual) */
  portfolioIncomeNeededTodayCents: number;
  portfolioIncomeNeededAtRetCents: number;

  /** Nest egg required at retirement day (nominal future pesos) */
  nestEggNeededAnnuityCents: number;
  nestEggNeededSwrCents: number;
  nestEggNeededCents: number;
  method: "annuity" | "swr" | "max";

  /** Projected portfolio at retirement (nominal) */
  projectedAtRetirementCents: number;
  projectedAtRetirementTodayCents: number;

  /** Gap: needed - projected (positive = shortfall) */
  gapCents: number;
  onTrack: boolean;
  fundedPercent: number;

  /** Extra monthly savings (today's pesos) needed to close gap */
  requiredMonthlyContributionCents: number;
  /** If continuing current contribution, age when nest egg is funded (or null) */
  ageFullyFunded: number | null;

  /** Sustainable annual withdrawal from projected nest egg (nominal at retirement) */
  sustainableWithdrawalAtRetCents: number;
  /** Same in today's money */
  sustainableWithdrawalTodayCents: number;

  replacementSuggestedCents: number;
  yearByYear: YearPoint[];
  summaryNotes: string[];
};

function clampAge(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function pctToRate(p: number) {
  return Math.max(-0.5, p) / 100;
}

function realRate(nominal: number, inflation: number) {
  return (1 + nominal) / (1 + inflation) - 1;
}

function pvAnnuity(annualPayment: number, realR: number, years: number): number {
  if (years <= 0) return 0;
  if (Math.abs(realR) < 1e-9) return annualPayment * years;
  return (annualPayment * (1 - Math.pow(1 + realR, -years))) / realR;
}

/** Future value of growing monthly contributions with monthly compounding */
function fvGrowingContributions(opts: {
  present: number;
  monthlyPmt: number;
  annualReturn: number;
  annualPmtGrowth: number;
  months: number;
}): number {
  const rm = Math.pow(1 + opts.annualReturn, 1 / 12) - 1;
  const gm = Math.pow(1 + opts.annualPmtGrowth, 1 / 12) - 1;
  let bal = opts.present;
  let pmt = opts.monthlyPmt;
  for (let m = 0; m < opts.months; m++) {
    bal = bal * (1 + rm) + pmt;
    pmt *= 1 + gm;
  }
  return bal;
}

/** Monthly payment to reach target FV from present value */
function pmtToTarget(opts: {
  present: number;
  target: number;
  annualReturn: number;
  months: number;
}): number {
  if (opts.months <= 0) return 0;
  const rm = Math.pow(1 + opts.annualReturn, 1 / 12) - 1;
  const fvOfPresent = opts.present * Math.pow(1 + rm, opts.months);
  const need = opts.target - fvOfPresent;
  if (need <= 0) return 0;
  if (Math.abs(rm) < 1e-12) return need / opts.months;
  // ordinary annuity: FV = PMT * ((1+r)^n - 1) / r
  return (need * rm) / (Math.pow(1 + rm, opts.months) - 1);
}

export function computeRetirement(raw: RetirementInputs): RetirementResult {
  const currentAge = clampAge(raw.currentAge, 18, 100);
  const retirementAge = clampAge(raw.retirementAge, currentAge, 100);
  const lifeExpectancyAge = clampAge(raw.lifeExpectancyAge, retirementAge + 1, 120);

  const yearsToRetirement = retirementAge - currentAge;
  const yearsInRetirement = lifeExpectancyAge - retirementAge;
  const monthsToRet = yearsToRetirement * 12;

  const taxDrag = Math.max(0, Math.min(50, raw.taxDragPercent)) / 100;
  const inflation = pctToRate(raw.inflationPercent);
  const returnPre = Math.max(0, pctToRate(raw.returnPrePercent) * (1 - taxDrag));
  const returnPost = Math.max(0, pctToRate(raw.returnPostPercent) * (1 - taxDrag));
  const realReturnPre = realRate(returnPre, inflation);
  const realReturnPost = realRate(returnPost, inflation);
  const swr = Math.max(0.5, raw.withdrawalRatePercent) / 100;
  const contribGrowth = pctToRate(raw.contributionGrowthPercent);

  const desiredToday = Math.max(0, raw.desiredAnnualIncomeCents);
  const pensionToday = Math.max(0, raw.pensionAnnualCents);
  const otherToday = Math.max(0, raw.otherIncomeAnnualCents);
  const guaranteedToday = pensionToday + otherToday;
  const portfolioIncomeNeededToday = Math.max(0, desiredToday - guaranteedToday);

  const inflate = (cents: number, years: number) =>
    Math.round(cents * Math.pow(1 + inflation, years));

  const desiredIncomeAtRetirementCents = inflate(desiredToday, yearsToRetirement);
  const portfolioIncomeNeededAtRetCents = inflate(
    portfolioIncomeNeededToday,
    yearsToRetirement
  );

  // Nest egg in TODAY's pesos via real annuity, then inflate to retirement-day pesos
  const nestEggTodayAnnuity = pvAnnuity(
    portfolioIncomeNeededToday,
    realReturnPost,
    yearsInRetirement
  );
  const nestEggNeededAnnuityCents = Math.round(
    nestEggTodayAnnuity * Math.pow(1 + inflation, yearsToRetirement)
  );
  const nestEggNeededSwrCents = Math.round(
    portfolioIncomeNeededAtRetCents / swr
  );
  // Use the more conservative (higher) of the two estimates
  const nestEggNeededCents = Math.max(
    nestEggNeededAnnuityCents,
    nestEggNeededSwrCents
  );
  const method: RetirementResult["method"] =
    nestEggNeededAnnuityCents >= nestEggNeededSwrCents ? "annuity" : "swr";

  const currentSavings = Math.max(0, raw.currentSavingsCents);
  const monthlyPmt = Math.max(0, raw.monthlyContributionCents);

  const projectedAtRetirementCents = Math.round(
    fvGrowingContributions({
      present: currentSavings,
      monthlyPmt,
      annualReturn: returnPre,
      annualPmtGrowth: contribGrowth,
      months: monthsToRet,
    })
  );
  const projectedAtRetirementTodayCents = Math.round(
    projectedAtRetirementCents / Math.pow(1 + inflation, yearsToRetirement)
  );

  const gapCents = nestEggNeededCents - projectedAtRetirementCents;
  const onTrack = gapCents <= 0;
  const fundedPercent =
    nestEggNeededCents > 0
      ? Math.min(999, Math.round((projectedAtRetirementCents / nestEggNeededCents) * 100))
      : 100;

  const requiredMonthlyContributionCents = Math.round(
    pmtToTarget({
      present: currentSavings,
      target: nestEggNeededCents,
      annualReturn: returnPre,
      months: Math.max(1, monthsToRet),
    })
  );

  // Year-by-year simulation
  const yearByYear: YearPoint[] = [];
  let portfolio = currentSavings;
  let monthly = monthlyPmt;
  const rmPre = Math.pow(1 + returnPre, 1 / 12) - 1;
  const gm = Math.pow(1 + contribGrowth, 1 / 12) - 1;
  const rmPost = Math.pow(1 + returnPost, 1 / 12) - 1;

  let ageFullyFunded: number | null = null;

  for (let y = 0; y < yearsToRetirement; y++) {
    let contribYear = 0;
    for (let m = 0; m < 12; m++) {
      portfolio = portfolio * (1 + rmPre) + monthly;
      contribYear += monthly;
      monthly *= 1 + gm;
    }
    const age = currentAge + y + 1;
    const yearIndex = y + 1;
    if (
      ageFullyFunded === null &&
      portfolio >= nestEggNeededCents * Math.pow(1 + inflation, -(yearsToRetirement - yearIndex))
    ) {
      // approximate: portfolio in today's money vs nest egg in today's money
      const portToday = portfolio / Math.pow(1 + inflation, yearIndex);
      if (portToday >= nestEggTodayAnnuity) ageFullyFunded = age;
    }
    yearByYear.push({
      age,
      yearIndex,
      phase: "accumulation",
      portfolioCents: Math.round(portfolio),
      portfolioTodayCents: Math.round(portfolio / Math.pow(1 + inflation, yearIndex)),
      contributionsThisYearCents: Math.round(contribYear),
      withdrawalThisYearCents: 0,
    });
  }

  // Retirement drawdown: spend inflated need each year, portfolio earns returnPost
  let retPortfolio = portfolio;
  for (let y = 0; y < yearsInRetirement; y++) {
    const yearFromNow = yearsToRetirement + y + 1;
    const spend = inflate(portfolioIncomeNeededToday, yearsToRetirement + y);
    // begin-year withdrawal simplified: monthly model
    let withdrew = 0;
    const monthlySpend = spend / 12;
    for (let m = 0; m < 12; m++) {
      retPortfolio = Math.max(0, retPortfolio - monthlySpend);
      retPortfolio *= 1 + rmPost;
      withdrew += monthlySpend;
    }
    yearByYear.push({
      age: retirementAge + y + 1,
      yearIndex: yearFromNow,
      phase: "retirement",
      portfolioCents: Math.round(retPortfolio),
      portfolioTodayCents: Math.round(
        retPortfolio / Math.pow(1 + inflation, yearFromNow)
      ),
      contributionsThisYearCents: 0,
      withdrawalThisYearCents: Math.round(withdrew),
    });
  }

  const sustainableWithdrawalAtRetCents = Math.round(
    projectedAtRetirementCents * swr
  );
  const sustainableWithdrawalTodayCents = Math.round(
    sustainableWithdrawalAtRetCents / Math.pow(1 + inflation, yearsToRetirement)
  );

  const replacementSuggestedCents = Math.round(
    (Math.max(0, raw.currentAnnualIncomeCents) * Math.max(0, raw.replacementPercent)) /
      100
  );

  const summaryNotes: string[] = [];
  if (guaranteedToday > 0) {
    summaryNotes.push(
      "pensions_applied"
    );
  }
  if (onTrack) {
    summaryNotes.push("on_track");
  } else {
    summaryNotes.push("shortfall");
  }
  if (realReturnPost < 0) {
    summaryNotes.push("negative_real_return");
  }
  if (yearsToRetirement < 5) {
    summaryNotes.push("near_retirement");
  }

  return {
    yearsToRetirement,
    yearsInRetirement,
    returnPre,
    returnPost,
    inflation,
    realReturnPre,
    realReturnPost,
    desiredIncomeAtRetirementCents,
    portfolioIncomeNeededTodayCents: portfolioIncomeNeededToday,
    portfolioIncomeNeededAtRetCents,
    nestEggNeededAnnuityCents,
    nestEggNeededSwrCents,
    nestEggNeededCents,
    method,
    projectedAtRetirementCents,
    projectedAtRetirementTodayCents,
    gapCents,
    onTrack,
    fundedPercent,
    requiredMonthlyContributionCents,
    ageFullyFunded,
    sustainableWithdrawalAtRetCents,
    sustainableWithdrawalTodayCents,
    replacementSuggestedCents,
    yearByYear,
    summaryNotes,
  };
}
