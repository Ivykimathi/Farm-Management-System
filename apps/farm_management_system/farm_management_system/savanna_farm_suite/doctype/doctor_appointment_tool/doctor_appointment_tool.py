# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DoctorAppointmentTool(Document):
	pass


@frappe.whitelist()
def create_appointments(doctor, treatment_type, appointment_date, animal,
                        poultry_batch=None,
                        cattle_shed=None, cattle=None,
                        sheep_shed=None, sheep=None,
                        rabbit_shed=None, rabbit=None,
                        pig_shed=None, pig=None,
                        goat_shed=None, goat=None):
    """Create a new Treatment and Vaccination Log"""
    try:
        doc = frappe.new_doc("Treatment and Vaccination Logs")
        doc.specify_type_of_treatment = treatment_type
        doc.doctor = doctor
        doc.treatment_date = appointment_date
        doc.animal_under_medication = animal
        if poultry_batch:
            doc.poultry_batch_under_treatment = poultry_batch
        
        if cattle_shed:
            doc.cattle_shed_under_treatment = cattle_shed
        if cattle:
            doc.specific_cattle_under_treatment = cattle
            
        if sheep_shed:
            doc.sheep_shed_under_treatment = sheep_shed
        if sheep:
            doc.specific_sheep_under_treatment = sheep
            
        if rabbit_shed:
            doc.rabbit_shed_under_treatment = rabbit_shed
        if rabbit:
            doc.specific_rabbit_under_treatment = rabbit
            
        if pig_shed:
            doc.pig_shed_under_treatment = pig_shed
        if pig:
            doc.specific_pig_under_treatment = pig
            
        if goat_shed:
            doc.goat_shed_under_treatment = goat_shed
        if goat:
            doc.specific_goat_under_treatment = goat

        doc.insert(ignore_permissions=True)        
        return {"name": doc.name}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Appointment Creation Error")
        frappe.throw(str(e))


@frappe.whitelist()
def get_animal_vaccine_first_uom(vaccine_name: str) -> str:
    """Return the first UOM value from the Animal Vaccines child table (uom/default_uom)."""
    try:
        av = frappe.get_doc("Animal Vaccines", vaccine_name)
        table = []
        # Prefer 'uom' if present, else 'default_uom'
        if hasattr(av, 'uom') and av.uom:
            table = av.uom
        elif hasattr(av, 'default_uom') and av.default_uom:
            table = av.default_uom
        if table:
            first = table[0]
            return first.get('uom') or first.get('uom_name') or first.get('uom_code') or first.get('name') or ''
        return ''
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Fetch Vaccine UOM Error")
        return ''