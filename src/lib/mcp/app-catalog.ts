import type { ToolSpec } from "@/lib/ai/complete";

export type AppToolMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type AppToolDef = {
  spec: ToolSpec;
  method: AppToolMethod;
  /** When set, an id in the arguments updates (PATCH) instead of creating (POST). */
  updateMethod?: "PATCH" | "PUT";
  path: string;
  /** Argument copied into the route's [id] param and removed from the body. */
  param?: "id";
  readOnly?: boolean;
  destructive?: boolean;
  /** id means update; otherwise create. */
  upsert?: boolean;
};

const obj = (
  description: string,
  properties: Record<string, unknown>,
  required?: string[]
): ToolSpec["parameters"] => ({
  type: "object",
  description,
  properties,
  ...(required ? { required } : {}),
  additionalProperties: true,
});

const id = { type: "string", description: "Existing record id. Omit to create." };
const amount = { type: "number", description: "Currency units, e.g. 185.50. Not cents." };
const date = { type: "string", description: "YYYY-MM-DD. Defaults to today when omitted." };
const period = { type: "string", description: "Quincena YYYY-MM-1 (days 1-15) or YYYY-MM-2 (day 16 through month end)." };

function tool(
  name: string,
  title: string,
  description: string,
  parameters: ToolSpec["parameters"],
  call: Omit<AppToolDef, "spec">
): AppToolDef {
  return { spec: { name, description: `${title}. ${description}`, parameters }, ...call };
}

export const APP_TOOLS: AppToolDef[] = [
  tool("get_dashboard", "Dashboard", "Month snapshot: balances, spending, and recent movements.", obj("Optional month YYYY-MM.", { month: { type: "string" } }), { method: "GET", path: "/api/dashboard", readOnly: true }),
  tool("list_budgets", "List budgets", "Budgets for one quincena, with spent and leftover.", obj("Period key, or month YYYY-MM plus half 1 or 2.", { period, month: { type: "string" }, half: { type: "string", enum: ["1", "2"] } }), { method: "GET", path: "/api/budgets", readOnly: true }),
  tool("save_budget", "Set a budget", "Set a category's planned amount for a quincena. scope: this_period, both_periods, default, or next_year.", obj("Category id from list_categories.", { categoryId: { type: "string" }, amount, period, scope: { type: "string" } }, ["categoryId", "amount"]), { method: "POST", path: "/api/budgets" }),
  tool("delete_budget", "Delete a budget row", "Remove one budget row. Only when the user asked.", obj("Budget row id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/budgets", destructive: true }),
  tool("copy_budgets", "Copy budgets", "Copy every category amount from one quincena to another.", obj("Both period keys.", { fromPeriod: period, toPeriod: period }, ["fromPeriod", "toPeriod"]), { method: "POST", path: "/api/budgets/copy" }),
  tool("list_budget_defaults", "List default budgets", "Amounts copied into new quincenas.", obj("No arguments.", {}), { method: "GET", path: "/api/budgets/defaults", readOnly: true }),
  tool("save_budget_default", "Set a default budget", "Default planned amount for a category.", obj("Category id and amount.", { categoryId: { type: "string" }, amount }, ["categoryId", "amount"]), { method: "POST", path: "/api/budgets/defaults" }),
  tool("delete_budget_default", "Delete a default budget", "Only when the user asked.", obj("Default row id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/budgets/defaults", destructive: true }),
  tool("save_account", "Create or update an account", "Bank or cash account. Types include checking, savings, cash, retirement. Personal accounts are created per member and cannot be created here.", obj("Name required to create.", { id, name: { type: "string" }, type: { type: "string" }, icon: { type: "string" }, initialBalance: amount }), { method: "POST", updateMethod: "PATCH", path: "/api/accounts", upsert: true }),
  tool("delete_account", "Delete an account", "Shared accounts only. Only when the user asked.", obj("Account id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/accounts", destructive: true }),
  tool("transfer_funds", "Transfer between accounts", "Move money. Optional category makes it count as spending, such as a school allowance.", obj("Account ids or pass fromAccountId and toAccountId.", { fromAccountId: { type: "string" }, toAccountId: { type: "string" }, amount, description: { type: "string" }, date, categoryId: { type: "string" } }, ["fromAccountId", "toAccountId", "amount"]), { method: "POST", path: "/api/accounts/transfer" }),
  tool("save_category", "Create or update a category", "Income or expense category.", obj("Name and type to create.", { id, name: { type: "string" }, type: { type: "string", enum: ["income", "expense"] }, icon: { type: "string" }, color: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/categories", upsert: true }),
  tool("delete_category", "Delete a category", "Only when the user asked.", obj("Category id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/categories", destructive: true }),
  tool("save_credit_card", "Create or update a credit card", "Name, statement cut day, and grace days. Never send a full card number.", obj("Name to create.", { id, name: { type: "string" }, lastFour: { type: "string", description: "Last 4 digits only, optional" }, cutoffDay: { type: "number" }, graceDays: { type: "number" }, color: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/credit-cards", upsert: true }),
  tool("delete_credit_card", "Delete a credit card", "Only when the user asked.", obj("Card id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/credit-cards", destructive: true }),
  tool("get_credit_card", "Credit card detail", "Statement, installments, and balance for one card.", obj("Card id.", { id: { type: "string" } }, ["id"]), { method: "GET", path: "/api/credit-cards/:id", param: "id", readOnly: true }),
  tool("pay_credit_card", "Pay a credit card", "Pay the card from a bank account. This is real money movement.", obj("Card id, account id, and amount.", { id: { type: "string" }, accountId: { type: "string" }, amount, date }, ["id", "amount"]), { method: "POST", path: "/api/credit-cards/:id/pay", param: "id" }),
  tool("adjust_card_processing", "Adjust card processing delay", "Move installment charges between statement cycles.", obj("Card id and the route's move list.", { id: { type: "string" } }, ["id"]), { method: "POST", path: "/api/credit-cards/:id/adjust-processing", param: "id" }),
  tool("list_installments", "List installment plans", "MSI and other installment plans.", obj("No arguments.", {}), { method: "GET", path: "/api/installments", readOnly: true }),
  tool("save_installment", "Create or update an installment plan", "Total, months, card, and start date.", obj("Description, total amount, and months to create.", { id, description: { type: "string" }, totalAmount: amount, months: { type: "number" }, creditCardId: { type: "string" }, categoryId: { type: "string" }, startDate: date }), { method: "POST", updateMethod: "PATCH", path: "/api/installments", upsert: true }),
  tool("delete_installment", "Delete an installment plan", "Only when the user asked.", obj("Plan id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/installments", destructive: true }),
  tool("list_recurring_income", "List recurring income", "Salaries and other repeating income.", obj("No arguments.", {}), { method: "GET", path: "/api/recurring", readOnly: true }),
  tool("save_recurring_income", "Create or update recurring income", "Amount, day of month, and account.", obj("Name and amount to create.", { id, name: { type: "string" }, amount, dayOfMonth: { type: "number" }, accountId: { type: "string" }, categoryId: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/recurring", upsert: true }),
  tool("delete_recurring_income", "Delete recurring income", "Only when the user asked.", obj("Recurring income id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/recurring", destructive: true }),
  tool("list_recurring_expenses", "List recurring expenses", "Subscriptions and other repeating expenses.", obj("No arguments.", {}), { method: "GET", path: "/api/recurring-expenses", readOnly: true }),
  tool("save_recurring_expense", "Create or update a recurring expense", "Amount, day, and account or card.", obj("Name and amount to create.", { id, name: { type: "string" }, amount, dayOfMonth: { type: "number" }, accountId: { type: "string" }, creditCardId: { type: "string" }, categoryId: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/recurring-expenses", upsert: true }),
  tool("delete_recurring_expense", "Delete a recurring expense", "Only when the user asked.", obj("Recurring expense id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/recurring-expenses", destructive: true }),
  tool("list_debts", "List debts", "Loans and other debts with balances.", obj("No arguments.", {}), { method: "GET", path: "/api/debts", readOnly: true }),
  tool("save_debt", "Create or update a debt", "Principal, rate, and payment.", obj("Name and principal to create.", { id, name: { type: "string" }, principal: amount, annualRatePercent: { type: "number" }, monthlyPayment: amount, interestMethod: { type: "string" }, paymentDay: { type: "number" } }), { method: "POST", updateMethod: "PATCH", path: "/api/debts", upsert: true }),
  tool("delete_debt", "Delete a debt", "Only when the user asked.", obj("Debt id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/debts", destructive: true }),
  tool("record_debt_payment", "Record a debt payment", "Capital and interest payment from an account.", obj("Debt id and amount.", { debtId: { type: "string" }, amount, date, accountId: { type: "string" } }, ["debtId", "amount"]), { method: "POST", path: "/api/debt-payments" }),
  tool("delete_debt_payment", "Delete a debt payment", "Only when the user asked. Also removes the linked movement.", obj("Payment id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/debt-payments", destructive: true }),
  tool("list_goals", "List goals", "Savings goals and reserves.", obj("Optional status filter.", { status: { type: "string" } }), { method: "GET", path: "/api/goals", readOnly: true }),
  tool("save_goal", "Create or update a goal", "Target amount and optional contribution.", obj("Name and target to create.", { id, name: { type: "string" }, targetAmount: amount, status: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/goals", upsert: true }),
  tool("delete_goal", "Delete a goal", "Only when the user asked.", obj("Goal id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/goals", destructive: true }),
  tool("get_retirement", "Retirement plan", "Saved plan and projection.", obj("No arguments.", {}), { method: "GET", path: "/api/retirement", readOnly: true }),
  tool("save_retirement", "Save retirement plan", "Ages, contributions, and return assumptions. Amounts are currency units per year or month as the app form uses them.", obj("Send only fields to change.", {}), { method: "PUT", path: "/api/retirement" }),
  tool("suggest_retirement", "Suggest a retirement plan", "Suggest contributions from income and budgets. Does not save.", obj("Optional replacement percent.", { replacementPercent: { type: "number" } }), { method: "POST", path: "/api/retirement", readOnly: true }),
  tool("get_retirement_rates", "Market rates", "Latest saved market rates used by retirement.", obj("No arguments.", {}), { method: "GET", path: "/api/retirement/rates", readOnly: true }),
  tool("list_allowances", "List allowances", "Spending caps for members.", obj("No arguments.", {}), { method: "GET", path: "/api/allowances", readOnly: true }),
  tool("save_allowance", "Create or update an allowance", "Member cap, weekly or monthly, optional category.", obj("Member user id, name, and amount.", { id, userId: { type: "string" }, name: { type: "string" }, amount, period: { type: "string", enum: ["weekly", "monthly"] }, categoryId: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/allowances", upsert: true }),
  tool("delete_allowance", "Delete an allowance", "Only when the user asked.", obj("Allowance id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/allowances", destructive: true }),
  tool("get_personal_summary", "Personal money summary", "The member's own envelope: income, budgets, and spending.", obj("Optional month YYYY-MM.", { month: { type: "string" } }), { method: "GET", path: "/api/personal/summary", readOnly: true }),
  tool("save_personal_income", "Create or update personal income", "Income inside the personal envelope.", obj("Amount and name.", { id, name: { type: "string" }, amount, date }), { method: "POST", updateMethod: "PATCH", path: "/api/personal/incomes", upsert: true }),
  tool("delete_personal_income", "Delete personal income", "Only when the user asked.", obj("Id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/personal/incomes", destructive: true }),
  tool("save_personal_expense", "Create or update a personal expense", "Expense inside the personal envelope.", obj("Amount and description.", { id, description: { type: "string" }, amount, date, categoryId: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/personal/expenses", upsert: true }),
  tool("delete_personal_expense", "Delete a personal expense", "Only when the user asked.", obj("Id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/personal/expenses", destructive: true }),
  tool("save_personal_budget", "Create or update a personal budget", "Envelope amount for a personal category.", obj("Category and amount.", { id, categoryId: { type: "string" }, amount, period }), { method: "POST", updateMethod: "PATCH", path: "/api/personal/budgets", upsert: true }),
  tool("delete_personal_budget", "Delete a personal budget", "Only when the user asked.", obj("Id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/personal/budgets", destructive: true }),
  tool("save_personal_allocation", "Update a personal allocation", "Editable splits are updated by id. New ones are no longer created here; transfer into the member's personal account instead.", obj("Allocation id and fields to change.", { id: { type: "string" }, name: { type: "string" }, amount, userId: { type: "string" }, active: { type: "boolean" } }, ["id"]), { method: "PATCH", path: "/api/personal/allocations" }),
  tool("delete_personal_allocation", "Delete a personal allocation", "Only when the user asked.", obj("Id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/personal/allocations", destructive: true }),
  tool("get_safe_to_spend", "Safe to spend", "Cash projection. accountId optional. includeIncome defaults on. reserveBudgets=1 holds budget money back.", obj("Query fields.", { accountId: { type: "string" }, horizon: { type: "string" }, includeIncome: { type: "string" }, reserveBudgets: { type: "string" }, targetDate: { type: "string" }, targetAmount: { type: "string" } }), { method: "GET", path: "/api/safe-to-spend", readOnly: true }),
  tool("project_safe_to_spend", "What-if safe to spend", "Projection with extra future income or expenses.", obj("Same idea as the safe-to-spend page.", {}), { method: "POST", path: "/api/safe-to-spend", readOnly: true }),
  tool("get_catchup", "Catch-up preview", "What to record since the last visit.", obj("No arguments.", {}), { method: "GET", path: "/api/catchup", readOnly: true }),
  tool("apply_catchup", "Apply catch-up", "Save the movements the user confirmed from the catch-up preview.", obj("The transactions, incomes, and expenses the user confirmed.", {}), { method: "POST", path: "/api/catchup" }),
  tool("list_properties", "List properties", "Assets and liabilities. Requires the properties module.", obj("No arguments.", {}), { method: "GET", path: "/api/properties", readOnly: true }),
  tool("save_property", "Create or update a property", "Asset or liability, value, and optional loan link.", obj("Name, kind asset or liability, and value.", { id, name: { type: "string" }, kind: { type: "string" }, category: { type: "string" }, value: amount }), { method: "POST", updateMethod: "PATCH", path: "/api/properties", upsert: true }),
  tool("delete_property", "Delete a property", "Only when the user asked.", obj("Property id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/properties", destructive: true }),
  tool("add_property_improvement", "Add a property improvement", "Cost and estimated value effect.", obj("Property id, description, and cost.", { propertyId: { type: "string" }, description: { type: "string" }, cost: amount }, ["propertyId", "description", "cost"]), { method: "POST", path: "/api/property-improvements" }),
  tool("delete_property_improvement", "Delete a property improvement", "Only when the user asked.", obj("Improvement id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/property-improvements", destructive: true }),
  tool("get_prices", "Price comparison", "Stores, items, and latest quotes. Requires the prices module.", obj("No arguments.", {}), { method: "GET", path: "/api/prices", readOnly: true }),
  tool("save_price_item", "Create or update a grocery item", "Item to compare across stores.", obj("Name.", { id, name: { type: "string" } }), { method: "POST", updateMethod: "PATCH", path: "/api/prices/items", upsert: true }),
  tool("delete_price_item", "Delete a grocery item", "Only when the user asked.", obj("Item id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/prices/items", destructive: true }),
  tool("save_price_store", "Create a store", "Store name for price quotes.", obj("Name.", { name: { type: "string" } }, ["name"]), { method: "POST", path: "/api/prices/stores" }),
  tool("delete_price_store", "Delete a store", "Only when the user asked.", obj("Store id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/prices/stores", destructive: true }),
  tool("save_price_quote", "Record a price quote", "Price of an item at a store.", obj("Item, store, and price.", { itemId: { type: "string" }, storeId: { type: "string" }, price: amount }, ["itemId", "storeId", "price"]), { method: "POST", path: "/api/prices/quotes" }),
  tool("delete_price_quote", "Delete a price quote", "Only when the user asked.", obj("Quote id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/prices/quotes", destructive: true }),
  tool("save_price_purchase", "Record a price-shop purchase", "A purchase logged from the prices module.", obj("Amount and items.", { amount }), { method: "POST", path: "/api/prices/purchases" }),
  tool("delete_price_purchase", "Delete a price-shop purchase", "Only when the user asked.", obj("Purchase id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/prices/purchases", destructive: true }),
  tool("get_investments", "Investment profile", "Risk profile and suggestions. Requires the investments module.", obj("No arguments.", {}), { method: "GET", path: "/api/investments", readOnly: true }),
  tool("save_investments", "Save investment profile", "Replace the saved answers.", obj("The profile fields from the investments page.", {}), { method: "PUT", path: "/api/investments" }),
  tool("list_credits", "List credits", "Money lent to other people. Requires the credits module.", obj("No arguments.", {}), { method: "GET", path: "/api/credits", readOnly: true }),
  tool("save_credit", "Create or update a credit", "Someone who owes the household.", obj("Name and amount.", { id, name: { type: "string" }, amount }), { method: "POST", updateMethod: "PATCH", path: "/api/credits", upsert: true }),
  tool("delete_credit", "Delete a credit", "Only when the user asked.", obj("Credit id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/credits", destructive: true }),
  tool("record_credit_payment", "Record a credit payment", "Money received back from someone who owed the household.", obj("Credit id and amount.", { creditId: { type: "string" }, amount }, ["creditId", "amount"]), { method: "POST", path: "/api/credit-payments" }),
  tool("delete_credit_payment", "Delete a credit payment", "Only when the user asked.", obj("Payment id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/credit-payments", destructive: true }),
  tool("list_households", "List households", "Households this member belongs to.", obj("No arguments.", {}), { method: "GET", path: "/api/households", readOnly: true }),
  tool("create_household", "Create a household", "A new household owned by this member.", obj("Name and optional currency code.", { name: { type: "string" }, currency: { type: "string" } }, ["name"]), { method: "POST", path: "/api/households" }),
  tool("update_household", "Rename the household", "Name or currency. Admin only.", obj("Name or currency.", { name: { type: "string" }, currency: { type: "string" } }), { method: "PATCH", path: "/api/households" }),
  tool("list_family", "List family members", "Roles and names. Emails are hidden. This does not change security policies.", obj("No arguments.", {}), { method: "GET", path: "/api/members", readOnly: true }),
  tool("update_member_role", "Change a member role", "admin, member, or viewer. Does not change visibility policies.", obj("Membership id and role.", { membershipId: { type: "string" }, role: { type: "string", enum: ["admin", "member", "viewer"] } }, ["membershipId", "role"]), { method: "PATCH", path: "/api/members" }),
  tool("remove_member", "Remove a member", "Removes them from the household, not their login. Only when the user asked.", obj("Membership id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/members", destructive: true }),
  tool("list_invites", "List invites", "Pending invitations.", obj("No arguments.", {}), { method: "GET", path: "/api/invites", readOnly: true }),
  tool("create_invite", "Invite someone", "Email and role. The app applies the default access for that role.", obj("Email and role.", { email: { type: "string" }, role: { type: "string", enum: ["admin", "member", "viewer"] } }, ["email", "role"]), { method: "POST", path: "/api/invites" }),
  tool("update_invite", "Update an invite", "Change a pending invite's role. Does not change visibility policies.", obj("Invite id and role.", { inviteId: { type: "string" }, role: { type: "string", enum: ["admin", "member", "viewer"] } }, ["inviteId", "role"]), { method: "PATCH", path: "/api/invites" }),
  tool("delete_invite", "Cancel an invite", "Only when the user asked.", obj("Invite id.", { id: { type: "string" } }, ["id"]), { method: "DELETE", path: "/api/invites", destructive: true }),
  tool("list_modules", "List add-on modules", "Properties, prices, investments, and credits. Shows which are installed.", obj("No arguments.", {}), { method: "GET", path: "/api/modules", readOnly: true }),
  tool("install_module", "Install an add-on", "moduleId: properties, prices, investments, or credits.", obj("Module id.", { moduleId: { type: "string" } }, ["moduleId"]), { method: "POST", path: "/api/modules" }),
  tool("remove_module", "Remove an add-on", "Only when the user asked.", obj("Module id.", { moduleId: { type: "string" } }, ["moduleId"]), { method: "DELETE", path: "/api/modules", destructive: true }),
  tool("get_preferences", "Get preferences", "Language and theme for this member.", obj("No arguments.", {}), { method: "GET", path: "/api/preferences", readOnly: true }),
  tool("update_preferences", "Update preferences", "locale es or en, display name, or theme.", obj("Fields to change.", { locale: { type: "string" }, displayName: { type: "string" }, theme: { type: "string" } }), { method: "PATCH", path: "/api/preferences" }),
  tool("get_meat_link", "Meat connection", "Whether grocery purchases from Meat are accepted, and which account they use. Does not reveal the key.", obj("No arguments.", {}), { method: "GET", path: "/api/integrations/meat", readOnly: true }),
  tool("update_meat_link", "Update Meat connection", "Enable it and choose the account, card, or category. Does not rotate the key.", obj("Fields to change.", { enabled: { type: "boolean" }, accountId: { type: "string" }, creditCardId: { type: "string" }, categoryId: { type: "string" }, appUrl: { type: "string" } }), { method: "PATCH", path: "/api/integrations/meat" }),
  tool("parse_ticket", "Parse a receipt", "Turn receipt text into items. Does not save a movement.", obj("Receipt text.", { text: { type: "string" }, forceRules: { type: "boolean" } }, ["text"]), { method: "POST", path: "/api/tickets/parse", readOnly: true }),
  tool("import_ticket", "Import a parsed receipt", "Save a receipt as an expense.", obj("Amount, description, and optional account or card.", { amount, description: { type: "string" }, date, accountId: { type: "string" }, creditCardId: { type: "string" }, categoryId: { type: "string" } }), { method: "POST", path: "/api/tickets/import" }),
  tool("parse_statement", "Parse a card statement", "Turn statement text into installment rows. Does not save them.", obj("Statement text.", { text: { type: "string" }, forceRules: { type: "boolean" } }, ["text"]), { method: "POST", path: "/api/statements/parse", readOnly: true }),
  tool("export_backup", "Build an encrypted backup", "Same encrypted export as the app. Small files are returned as base64. Large ones must be downloaded in the app.", obj("Password that will encrypt the file.", { password: { type: "string" } }, ["password"]), { method: "POST", path: "/api/export" }),
  tool("import_backup", "Import an encrypted backup", "fileBase64 is the .enc file. This merges or replaces household data the same way the app does. Only when the user asked.", obj("Password and base64 file.", { password: { type: "string" }, fileBase64: { type: "string" }, filename: { type: "string" } }, ["password", "fileBase64"]), { method: "POST", path: "/api/import", destructive: true }),
];

export const APP_TOOL_NAMES = new Set(APP_TOOLS.map((tool) => tool.spec.name));
