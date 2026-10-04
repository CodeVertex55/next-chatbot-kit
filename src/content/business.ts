import type { BusinessContent } from "@/chat";

const siteUrl = process.env.SITE_URL?.trim() || "http://localhost:3000";

const PHONE = "555-0142";
const EMERGENCY_PHONE = "555-0143";
const AFTER_EXAMINATION = "The price is confirmed after an examination.";

/** Wren Street Dental is a fictional practice. Every detail here is invented for the demo. */
export const business: BusinessContent = {
  name: "Wren Street Dental",
  description: "a friendly general dental practice in Marlow Bay",
  siteUrl,
  phone: PHONE,
  phoneHref: "tel:5550142",
  emergencyPhone: EMERGENCY_PHONE,
  email: "hello@wrenstreetdental.example",
  address: "12 Wren Street, Marlow Bay",
  bookingUrl: `${siteUrl}/contact`,
  hours: [
    { days: "Monday to Thursday", hours: "8:30 to 17:30" },
    { days: "Friday", hours: "8:30 to 16:00" },
    { days: "Saturday", hours: "9:00 to 13:00" },
    { days: "Sunday", hours: "Closed" },
  ],
  hoursNote: "The practice is closed on public holidays.",
  services: [
    {
      name: "New patient examination",
      summary:
        "A full check of your teeth and gums, with x-rays if the dentist needs them, and a written treatment plan.",
      price: "from $65",
    },
    {
      name: "Routine examination",
      summary: "A regular check-up for existing patients to keep an eye on your teeth and gums.",
      price: "from $45",
    },
    {
      name: "Hygiene appointment",
      summary: "A professional clean with the hygienist, plus advice on caring for your teeth.",
      price: "from $80",
    },
    {
      name: "Dental X-rays",
      summary: "Small x-ray images that help the dentist see what cannot be seen by eye.",
      price: "from $25 each",
    },
    {
      name: "Emergency appointment",
      summary: "A visit for sudden pain, a broken tooth or a lost filling.",
      price: "from $95",
    },
    {
      name: "White fillings",
      summary: `Tooth coloured fillings that repair small and medium cavities. ${AFTER_EXAMINATION}`,
    },
    {
      name: "Crowns",
      summary: `A custom cap that covers and protects a weakened tooth. ${AFTER_EXAMINATION}`,
    },
    {
      name: "Root canal treatment",
      summary: `Treatment to clean the inside of an infected tooth so it can be kept. ${AFTER_EXAMINATION}`,
    },
    {
      name: "Tooth whitening",
      summary: `A professional whitening plan supervised by the dentist. ${AFTER_EXAMINATION}`,
    },
    {
      name: "Clear aligners",
      summary: `Removable clear trays that gently move teeth into a new position. ${AFTER_EXAMINATION}`,
    },
  ],
  pricingNote:
    "A dentist gives a written treatment plan with the final price after an examination.",
  team: [
    { name: "Dr Imogen Hale", role: "Dentist" },
    { name: "Marcus Tolliver", role: "Dental hygienist" },
    { name: "Nadia Brennan", role: "Practice manager" },
  ],
  policies: [
    {
      title: "Cancellations",
      text: "Please give at least 24 hours notice to cancel or move an appointment, so that we can offer the time to someone else. Call 555-0142 to do this.",
    },
    {
      title: "Late arrivals",
      text: "If you arrive more than 15 minutes late we may need to shorten your visit or offer a new time.",
    },
    {
      title: "Payment methods",
      text: "We accept cash, debit and credit cards and bank transfer. Payment is due at the end of each visit. If you have health insurance, please call the practice to ask about cover.",
    },
    {
      title: "Access",
      text: "The practice has step-free access from the street and the rear car park, and the treatment rooms are on the ground floor.",
    },
  ],
  faqs: [
    {
      question: "How do I become a new patient?",
      answer:
        "Call 555-0142 or use the contact page to book a new patient examination. Please arrive ten minutes early for your first visit so that you can fill in a short form.",
    },
    {
      question: "What should I bring to my first visit?",
      answer:
        "Please bring photo identification, any recent x-rays or referral letters you have, a way to pay, and your health insurance card if you have one.",
    },
    {
      question: "I am nervous about the dentist. Can you help?",
      answer:
        "Yes. Tell the team when you book. We explain each step, go at your pace and stop whenever you ask.",
    },
    {
      question: "Do you see children?",
      answer:
        "Yes, we see children and adults. Tell us the child's age when you book so that we can set aside the right amount of time.",
    },
    {
      question: "Is there parking?",
      answer:
        "There are two patient spaces at the rear of the building, one of them wider for wheelchair users. There is also street parking on Wren Street.",
    },
    {
      question: "How can I pay?",
      answer:
        "We accept cash, debit and credit cards and bank transfer. Payment is due at the end of each visit, and the dentist explains the cost of any treatment before it starts.",
    },
    {
      question: "Does my health insurance cover my visit?",
      answer:
        "We cannot confirm what an insurer or plan will cover. Please call 555-0142 with your plan details and the team will help.",
    },
    {
      question: "What if I need to cancel or move my appointment?",
      answer:
        "Please give at least 24 hours notice by calling 555-0142, so that we can offer the time to someone else.",
    },
    {
      question: "What if I am running late?",
      answer:
        "Please call 555-0142 as soon as you know. If you arrive more than 15 minutes late we may need to shorten your visit or offer a new time.",
    },
    {
      question: "What should I do in a dental emergency during opening hours?",
      answer:
        "Call 555-0142 as early as you can and the team will tell you what can be arranged. If you cannot breathe or swallow properly, or you have bleeding that will not stop, call emergency services now.",
    },
    {
      question: "What should I do in a dental emergency out of hours?",
      answer:
        "Call the emergency line on 555-0143. For swelling that affects breathing or swallowing, bleeding that will not stop, or an injury to the face or jaw, call emergency services first.",
    },
    {
      question: "Is the practice easy to get into with a wheelchair or pram?",
      answer:
        "Yes. There is step-free access from the street and from the rear car park, and every treatment room is on the ground floor.",
    },
  ],
  pages: [
    { title: "Home", url: `${siteUrl}/` },
    { title: "Treatments and fees", url: `${siteUrl}/treatments` },
    { title: "Contact", url: `${siteUrl}/contact` },
    { title: "Privacy", url: `${siteUrl}/privacy` },
  ],
};

/** Three short points for the home page. */
export const highlights: { title: string; text: string }[] = [
  {
    title: "Gentle with nervous patients",
    text: "We explain each step, go at your pace and stop whenever you ask.",
  },
  {
    title: "Fees you can read first",
    text: "Examinations, hygiene visits and x-rays have published fees on the treatments page.",
  },
  {
    title: "An emergency line",
    text: `If something urgent happens out of hours, call ${EMERGENCY_PHONE}.`,
  },
];
