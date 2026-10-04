import type { Metadata } from "next";
import { business } from "@/content/business";

export const metadata: Metadata = {
  title: "Treatments and fees",
};

export default function Treatments() {
  return (
    <>
      <h1>Treatments and fees</h1>
      <p className="lead">{business.pricingNote}</p>

      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Treatments and published fees</caption>
          <thead>
            <tr>
              <th scope="col">Treatment</th>
              <th scope="col">What it is</th>
              <th scope="col">Fee</th>
            </tr>
          </thead>
          <tbody>
            {business.services.map((service) => (
              <tr key={service.name}>
                <th scope="row">{service.name}</th>
                <td>{service.summary}</td>
                <td className="fee">{service.price ?? "After an examination"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
