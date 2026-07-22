-- Remove the screenshot-only record that could be mistaken for real employee data.
delete from compliance_documents
where doc_type = 'insurance_certificate'
  and description = '1099 booth renter proof of insurance, due for renewal.';
