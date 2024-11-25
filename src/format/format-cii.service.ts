import { Injectable } from '@nestjs/common';
import * as jsonpath from 'jsonpath-plus';

import { FormatUBLService } from './format-ubl.service';
import { EInvoiceFormat } from './format.e-invoice-format.interface';
import { Invoice } from '../invoice/invoice.interface';

// This is what we are looking at while traversing the input tree:
export type Node = { [key: string]: Node } | Node[] | string;
export type ObjectNode = { [key: string]: Node };

// Flags for Factur-X usage.
export type FXProfile =
	| 0x0
	| 0x1
	| 0x2
	| 0x3
	| 0x4
	| 0x5
	| 0x6
	| 0x7
	| 0x8
	| 0xa
	| 0xb
	| 0xc
	| 0xd
	| 0xe
	| 0xf
	| 0x10
	| 0x11
	| 0x12
	| 0x13
	| 0x14
	| 0x15
	| 0x16
	| 0x17
	| 0x18
	| 0x19
	| 0x1a
	| 0x1b
	| 0x1c
	| 0x1d
	| 0x1d
	| 0x1f;
export const FULL_CII: FXProfile = 0x0; // Field not allowed for Factur-X.
export const FX_EXTENDED: FXProfile = 0x1;
export const FX_EN16931: FXProfile = 0x2;
export const FX_BASIC: FXProfile = 0x4;
export const FX_BASIC_WL: FXProfile = 0x8;
export const FX_MINIMUM: FXProfile = 0x10;

export type SubType = 'DateTimeString';

// Both `src` and `dest` contain an array of element names that defines the
// path to that node.
//
// For `src`, a special semantic exists.  If an element name begins with the
// special prefix "fixed:", everything after that prefix is returned.  In
// general, this should be the last element in the list so that it is only
// rendered if the elements it depends on exist in the source.
export type Transformation =
	| {
			type: 'object' | 'array';
			subtype?: never;
			src: string[];
			dest: string[];
			children: Transformation[];
			fxProfile?: never;
	  }
	| {
			type: 'string';
			subtype?: SubType;
			src: string[];
			dest: string[];
			children?: never;
			fxProfile: FXProfile;
	  };

const cacAdditionalItemProperty: Transformation = {
	type: 'object',
	src: ['cac:AdditionalItemProperty'],
	dest: ['ram:ApplicableProductCharacteristic'],
	children: [
		{
			type: 'string',
			src: ['cbc:Name'],
			dest: ['ram:Description'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:Value'],
			dest: ['ram:Value'],
			fxProfile: FX_EN16931,
		},
	],
};

const cacCommodityClassification: Transformation = {
	type: 'array',
	src: ['cac:CommodityClassification'],
	dest: ['ram:DesignatedProductClassification'],
	children: [
		{
			type: 'string',
			src: ['cbc:ItemClassificationCode'],
			dest: ['ram:ClassCode', 'ram:ListID'],
			fxProfile: FX_EN16931,
		},
	],
};

const cacItem: Transformation = {
	type: 'object',
	src: ['cac:Item'],
	dest: ['ram:SpecifiedTradeProduct'],
	children: [
		{
			type: 'string',
			src: ['cac:StandardItemIdentification', 'cbc:ID'],
			dest: ['ram:GlobalID'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cac:StandardItemIdentification', 'cbc:ID@schemeID'],
			dest: ['ram:GlobalID@schemeID'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cac:SellersItemIdentification', 'cbc:ID'],
			dest: ['ram:SellerAssignedID'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cac:BuyersItemIdentification', 'cbc:ID'],
			dest: ['ram:BuyerAssignedID'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:Name'],
			dest: ['ram:Name'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:Description'],
			dest: ['ram:Description'],
			fxProfile: FX_EN16931,
		},
		cacAdditionalItemProperty,
		cacCommodityClassification,
		{
			type: 'string',
			src: ['cac:OriginCountry', 'cbc:IdentificationCode'],
			dest: ['ram:OriginTradeCountry', 'ram:ID'],
			fxProfile: FX_EN16931,
		},
	],
};

const cacOrderLineReference: Transformation = {
	type: 'object',
	src: ['cac:OrderLineReference'],
	dest: ['ram:SpecifiedLineTradeAgreement'],
	children: [
		{
			type: 'string',
			src: ['cbc:LineID'],
			dest: ['ram:BuyerOrderReferencedDocument', 'ram:LineID'],
			fxProfile: FX_EN16931,
		},
	],
};

const cacPrice: Transformation = {
	type: 'object',
	src: ['cac:Price'],
	dest: [],
	children: [
		{
			type: 'string',
			src: ['cac:AllowanceCharge', 'cbc:BaseAmount'],
			dest: ['ram:GrossProductTradePrice', 'ram:ChargeAmount'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:BasisQuantity'],
			dest: ['ram:GrossProductTradePrice', 'ram:BasisQuantity'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:BasisQuantity@unitCode'],
			dest: ['ram:GrossProductTradePrice', 'ram:BasisQuantity@unitCode'],
			fxProfile: FX_EN16931,
		},
		// FIXME! This can go into a child object!
		{
			type: 'string',
			src: ['cac:AllowanceCharge', 'cbc:ChargeIndicator'],
			dest: [
				'ram:GrossProductTradePrice',
				'ram:AppliedTradeAllowanceCharge',
				'ram:ChargeIndicator',
				'udt:Indicator',
			],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cac:AllowanceCharge', 'cbc:Amount'],
			dest: [
				'ram:GrossProductTradePrice',
				'ram:AppliedTradeAllowanceCharge',
				'ram:ActualAmount',
			],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cac:AllowanceCharge', 'cbc:Amount@currencyID'],
			dest: [
				'ram:GrossProductTradePrice',
				'ram:AppliedTradeAllowanceCharge',
				'ram:ActualAmount@currencyID',
			],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:PriceAmount'],
			dest: [
				'ram:SpecifiedLineTradeAgreement',
				'ram:NetPriceProductTradePrice',
				'ram:ChargeAmount',
			],
			fxProfile: FX_EN16931,
		},
	],
};

const cacInvoiceLinePeriod: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:StartDate'],
		dest: ['ram:StartDateTime', 'udt:DateTimeString'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cbc:StartDate', 'fixed:102'],
		dest: [
			'ram:StartDateTime',
			'udt:DateTimeString',
			'udt:DateTimeString@format',
		],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cbc:EndDate'],
		dest: ['ram:EndDateTime', 'udt:DateTimeString'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cbc:EndDate', 'fixed:102'],
		dest: [
			'ram:EndDateTime',
			'udt:DateTimeString',
			'udt:DateTimeString@format',
		],
		fxProfile: FX_EN16931,
	},
];

const cacInvoiceLineAllowanceCharge: Transformation = {
	type: 'object',
	src: ['cac:AllowanceCharge'],
	dest: ['ram:SpecifiedTradeAllowanceCharge'],
	children: [
		{
			type: 'string',
			src: ['cbc:ChargeIndicator'],
			dest: ['ram:ChargeIndicator', 'udt:Indicator'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:MultiplierFactorNumeric'],
			dest: ['ram:CalculationPercent'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:BaseAmount'],
			dest: ['ram:BasisAmount'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:BaseAmount@currencyID'],
			dest: ['ram:BasisAmount@currencyID'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:Amount'],
			dest: ['ram:ActualAmount'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:Amount@currencyID'],
			dest: ['ram:ActualAmount@currencyID'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:AllowanceChargeReasonCode'],
			dest: ['ram:ReasonCode'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:AllowanceChargeReason'],
			dest: ['ram:Reason'],
			fxProfile: FX_BASIC,
		},
	],
};

const cacDocumentReference: Transformation = {
	type: 'object',
	src: ['cac:DocumentReference'],
	dest: ['ram:AdditionalReferencedDocument'],
	children: [
		{
			type: 'string',
			src: ['cbc:ID'],
			dest: ['ram:IssuerAssignedID'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:DocumentTypeCode'],
			dest: ['ram:TypeCode'],
			fxProfile: FX_EN16931,
		},
	],
};

const cacInvoiceLine: Transformation = {
	type: 'array',
	src: ['cac:InvoiceLine'],
	dest: ['ram:IncludedSupplyChainTradeLineItem'],
	children: [
		{
			type: 'string',
			src: ['cbc:ID'],
			dest: ['ram:AssociatedDocumentLineDocument', 'ram:LineID'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:Note'],
			dest: [
				'ram:AssociatedDocumentLineDocument',
				'ram:IncludedNote',
				'ram:Content',
			],
			fxProfile: FX_BASIC_WL,
		},
		cacItem,
		cacOrderLineReference,
		cacPrice,
		{
			type: 'string',
			src: ['cbc:InvoicedQuantity'],
			dest: ['ram:SpecifiedLineTradeDelivery', 'ram:BilledQuantity'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cbc:InvoicedQuantity@unitCode'],
			dest: ['ram:SpecifiedLineTradeDelivery', 'ram:BilledQuantity@unitCode'],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cac:Item', 'cac:ClassifiedTaxCategory', 'cac:TaxScheme', 'cbc:ID'],
			dest: [
				'ram:SpecifiedLineTradeSettlement',
				'ram:ApplicableTradeTax',
				'ram:TypeCode',
			],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cac:Item', 'cac:ClassifiedTaxCategory', 'cbc:ID'],
			dest: [
				'ram:SpecifiedLineTradeSettlement',
				'ram:ApplicableTradeTax',
				'ram:CategoryCode',
			],
			fxProfile: FX_BASIC,
		},
		{
			type: 'string',
			src: ['cac:Item', 'cac:ClassifiedTaxCategory', 'cbc:Percent'],
			dest: [
				'ram:SpecifiedLineTradeSettlement',
				'ram:ApplicableTradeTax',
				'ram:RateApplicablePercent',
			],
			fxProfile: FX_BASIC,
		},
		...cacInvoiceLinePeriod,
		cacInvoiceLineAllowanceCharge,
		{
			type: 'string',
			src: ['cbc:LineExtensionAmount'],
			dest: [
				'ram:SpecifiedLineTradeSettlement',
				'ram:SpecifiedTradeSettlementLineMonetarySummation',
				'ram:LineTotalAmount',
			],
			fxProfile: FX_BASIC,
		},
		cacDocumentReference,
		{
			type: 'string',
			src: ['cbc:AccountingCost'],
			dest: ['ram:ReceivableSpecifiedTradeAccountingAccount', 'ram:ID'],
			fxProfile: FX_EN16931,
		},
	],
};

export const cacPostalAddress: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:PostalZone'],
		dest: ['ram:PostcodeCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:StreetName'],
		dest: ['ram:LineOne'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:AdditionalStreetName'],
		dest: ['ram:LineTwo'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:AddressLine', 'cbc:Line'],
		dest: ['ram:LineThree'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:CityName'],
		dest: ['ram:CityName'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:Country', 'cbc:IdentificationCode'],
		dest: ['ram:CountryID'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cbc:CountrySubentity'],
		dest: ['ram:CountrySubdivisionName'],
		fxProfile: FX_BASIC_WL,
	},
];

export const cacPartyTaxScheme: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:CompanyID'],
		dest: ['ram:ID'],
		fxProfile: FX_MINIMUM,
	},
	// FIXME! It must be possible to specify FC instead!
	{
		type: 'string',
		src: ['fixed:VA'],
		dest: ['ram:ID@schemeID'],
		fxProfile: FX_MINIMUM,
	},
];

export const cacAccountingSupplierParty: Transformation[] = [
	{
		type: 'array',
		src: [],
		dest: [],
		children: [
			{
				type: 'string',
				src: ['cac:PartyIdentification', 'cbc:ID'],
				dest: ['ram:ID'],
				fxProfile: FX_BASIC_WL,
			},
		],
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:RegistrationName'],
		dest: ['ram:Name'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:LegalForm'],
		dest: ['ram:Description'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID@schemeID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID@schemeID'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyName', 'cbc:Name'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:TradingBusinessName'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'object',
		src: ['cac:PostalAddress'],
		dest: ['ram:PostalTradeAddress'],
		children: cacPostalAddress,
	},
	{
		type: 'string',
		src: ['cbc:EndpointID'],
		dest: ['ram:URIUniversalCommunication', 'ram:URIID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:EndpointID@schemeID'],
		dest: ['ram:URIUniversalCommunication', 'ram:URIID@schemeID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'array',
		src: ['cac:PartyTaxScheme'],
		dest: ['ram:SpecifiedTaxRegistration'],
		children: cacPartyTaxScheme,
	},
];

export const cacAccountingCustomerParty: Transformation[] = [
	{
		type: 'string',
		src: ['cac:PartyIdentification', 'cbc:ID'],
		dest: ['ram:ID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:RegistrationName'],
		dest: ['ram:Name'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:LegalForm'],
		dest: ['ram:Description'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID@schemeID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID@schemeID'],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:PartyName', 'cbc:Name'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:TradingBusinessName'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'object',
		src: ['cac:PostalAddress'],
		dest: ['ram:PostalTradeAddress'],
		children: cacPostalAddress,
	},
	{
		type: 'string',
		src: ['cbc:EndpointID'],
		dest: ['ram:URIUniversalCommunication', 'ram:URIID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:EndpointID@schemeID'],
		dest: ['ram:URIUniversalCommunication', 'ram:URIID@schemeID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'object',
		src: ['cac:PartyTaxScheme'],
		dest: ['ram:SpecifiedTaxRegistration'],
		children: cacPartyTaxScheme,
	},
];

export const cacAdditionalDocumentReference: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:ID'],
		dest: ['ram:IssuerAssignedID'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:Attachment', 'cac:ExternalReference', 'cbc:URI'],
		dest: ['udt:URIID'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cbc:DocumentTypeCode'],
		dest: ['qdt:TypeCode'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cbc:DocumentDescription'],
		dest: ['ram:Name'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:Attachment', 'cbc:EmbeddedDocumentBinaryObject'],
		dest: ['ram:AttachmentBinaryObject'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:Attachment', 'cbc:EmbeddedDocumentBinaryObject@mimeCode'],
		dest: ['ram:AttachmentBinaryObject@mimeCode'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: ['cac:Attachment', 'cbc:EmbeddedDocumentBinaryObject@filename'],
		dest: ['ram:AttachmentBinaryObject@filename'],
		fxProfile: FX_EN16931,
	},
];

export const deliveryAddress: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:PostalZone'],
		dest: ['ram:PostcodeCode'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cbc:StreetName'],
		dest: ['ram:LineOne'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cbc:AdditionalStreetName'],
		dest: ['ram:LineTwo'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cac:AddressLine', 'cbc:Line'],
		dest: ['ram:LineThree'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cbc:CityName'],
		dest: ['ram:CityName'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cac:Country', 'cbc:IdentificationCode'],
		dest: ['ram:CountryID'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cbc:CountrySubentity'],
		dest: ['ram:CountrySubdivisionName'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cac:Delivery', 'cbc:ActualDeliveryDate'],
		dest: [
			'ram:ActualDeliverySupplyChainEvent',
			'ram:OccurrenceDateTime',
			'udt:DateTimeString',
		],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:Delivery', 'cbc:ActualDeliveryDate', 'fixed:102'],
		dest: [
			'ram:ActualDeliverySupplyChainEvent',
			'ram:OccurrenceDateTime',
			'udt:DateTimeString@format',
		],
		fxProfile: FX_MINIMUM,
	},
	{
		type: 'string',
		src: ['cac:DespatchDocumentReference', 'cbc:ID'],
		dest: ['ram:DespatchAdviceReferencedDocument', 'ram:IssuerAssignedID'],
		fxProfile: FX_BASIC_WL,
	},
];

const cacPayeeParty: Transformation[] = [
	{
		// FIXME! This is an array for certain CII variants.
		type: 'string',
		src: ['cac:PartyIdentification', 'cbc:ID'],
		dest: ['ram:ID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PartyName', 'cbc:Name'],
		dest: ['ram:Name'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PartyLegalEntity', 'cbc:CompanyID@schemeID'],
		dest: ['ram:SpecifiedLegalOrganization', 'ram:ID@schemeID'],
		fxProfile: FX_BASIC_WL,
	},
];

const cacPaymentMeans: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:PaymentMeansCode'],
		dest: ['ram:TypeCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:PaymentMeansCode@name'],
		dest: ['ram:Information'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:CardAccount', 'cbc:PrimaryAccountNumberID'],
		dest: ['ram:ApplicableTradeSettlementFinancialCard', 'ram:ID'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cac:CardAccount', 'cbc:HolderName'],
		dest: ['ram:ApplicableTradeSettlementFinancialCard', 'ram:CardHolderName'],
		fxProfile: FX_EXTENDED,
	},
	{
		type: 'string',
		src: ['cac:PaymentMandate', 'cac:PayerFinancialAccount', 'cbc:ID'],
		dest: ['ram:PayerPartyDebtorFinancialAccount', 'ram:IBANID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PayeeFinancialAccount', 'cbc:ID'],
		dest: ['ram:PayeePartyCreditorFinancialAccount', 'ram:IBANID'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:PayeeFinancialAccount', 'cbc:Name'],
		dest: ['ram:PayeePartyCreditorFinancialAccount', 'ram:AccountName'],
		fxProfile: FX_EN16931,
	},
	{
		type: 'string',
		src: [
			'cac:PayeeFinancialAccount',
			'cac:FinancialInstitutionBranch',
			'cbc:ID',
		],
		dest: ['ram:PayeeSpecifiedCreditorFinancialInstitution', 'ram:BICID'],
		fxProfile: FX_EN16931,
	},
];

export const cacTaxSubtotal: Transformation[] = [
	{
		type: 'string',
		src: ['cbc:TaxAmount'],
		dest: ['ram:CalculatedAmount'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:TaxCategory', 'cac:TaxScheme', 'cbc:ID'],
		dest: ['ram:TypeCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:TaxCategory', 'cbc:TaxExemptionReason'],
		dest: ['ram:ExemptionReason'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cbc:TaxableAmount'],
		dest: ['ram:BasisAmount'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:TaxCategory', 'cbc:ID'],
		dest: ['ram:CategoryCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:TaxCategory', 'cbc:TaxExemptionReasonCode'],
		dest: ['ram:ExemptionReasonCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['..', '..', 'cac:InvoicePeriod', 'cbc:DescriptionCode'],
		dest: ['ram:DueDateTypeCode'],
		fxProfile: FX_BASIC_WL,
	},
	{
		type: 'string',
		src: ['cac:TaxCategory', 'cbc:Percent'],
		dest: ['ram:RateApplicablePercent'],
		fxProfile: FX_BASIC_WL,
	},
];

export const cacInvoicePeriod: Transformation = {
	type: 'object',
	src: ['cac:InvoicePeriod'],
	dest: ['ram:ApplicableHeaderTradeSettlement', 'ram:BillingSpecifiedPeriod'],
	children: [
		{
			type: 'string',
			subtype: 'DateTimeString',
			src: ['cbc:StartDate'],
			dest: ['ram:StartDateTime', 'udt:DateTimeString'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:StartDate', 'fixed:102'],
			dest: ['ram:StartDateTime', 'udt:DateTimeString@format'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			subtype: 'DateTimeString',
			src: ['cbc:EndDate'],
			dest: ['ram:EndDateTime', 'udt:DateTimeString'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:EndDate', 'fixed:102'],
			dest: ['ram:EndDateTime', 'udt:DateTimeString@format'],
			fxProfile: FX_BASIC_WL,
		},
	],
};

// Document-level allowances and charges.
export const cacAllowanceCharge: Transformation = {
	type: 'array',
	src: ['cac:AllowanceCharge'],
	dest: [
		'ram:ApplicableHeaderTradeSettlement',
		'ram:SpecifiedTradeAllowanceCharge',
	],
	children: [
		{
			type: 'string',
			src: ['cbc:ChargeIndicator'],
			dest: ['ram:ChargeIndicator', 'udt:Indicator'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:MultiplierFactorNumeric'],
			dest: ['ram:CalculationPercent'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:BasisAmount'],
			dest: ['ram:BasisAmount'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:Amount'],
			dest: ['ram:ActualAmount'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:AllowanceChargeReasonCode'],
			dest: ['ram:ReasonCode'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:AllowanceChargeReason'],
			dest: ['ram:Reason'],
			fxProfile: FX_BASIC_WL,
		},
		// FIXME! Next 3 can go into a separate object!
		{
			type: 'string',
			src: ['cac:TaxCategory', 'cac:TaxScheme', 'cbc:ID'],
			dest: ['ram:CategoryTradeTax', 'ram:TypeCode'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cac:TaxCategory', 'cbc:ID'],
			dest: ['ram:CategoryTradeTax', 'ram:CategoryCode'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cac:TaxCategory', 'cbc:Percent'],
			dest: ['ram:CategoryTradeTax', 'ram:RateApplicablePercent'],
			fxProfile: FX_BASIC_WL,
		},
	],
};

export const cacLegalMonetaryTotal: Transformation = {
	type: 'object',
	src: ['cac:LegalMonetaryTotal'],
	dest: [
		'ram:ApplicableHeaderTradeSettlement',
		'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
	],
	children: [
		{
			type: 'string',
			src: ['cbc:LineExtensionAmount'],
			dest: ['ram:LineTotalAmount'],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:ChargeTotalAmount'],
			dest: ['ram:ChargeTotalAmount'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:AllowanceTotalAmount'],
			dest: ['ram:AllowanceTotalAmount'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:TaxExclusiveAmount'],
			dest: ['ram:TaxBasisTotalAmount'],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'array',
			src: ['..', 'cac:TaxTotal'],
			dest: ['ram:TaxTotalAmount'],
			children: [
				{
					type: 'object',
					src: [],
					dest: [],
					children: [
						{
							type: 'string',
							src: ['cbc:TaxAmount'],
							dest: ['#'],
							fxProfile: FX_MINIMUM,
						},
						{
							type: 'string',
							src: ['cbc:TaxAmount@currencyID'],
							dest: ['#@currencyID'],
							fxProfile: FX_MINIMUM,
						},
					],
				},
			],
		},
		{
			type: 'string',
			src: ['cbc:PayableRoundingAmount'],
			dest: ['ram:RoundingAmount'],
			fxProfile: FX_EN16931,
		},
		{
			type: 'string',
			src: ['cbc:TaxInclusiveAmount'],
			dest: ['ram:GrandTotalAmount'],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:TotalPrepaidAmount'],
			dest: ['ram:TotalPrepaidAmount'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'string',
			src: ['cbc:PayableAmount'],
			dest: ['ram:DuePayableAmount'],
			fxProfile: FX_MINIMUM,
		},
	],
};

export const ublInvoice: Transformation = {
	type: 'object',
	src: ['ubl:Invoice'],
	dest: ['rsm:CrossIndustryInvoice'],
	children: [
		{
			type: 'string',
			src: ['cbc:ProfileID'],
			dest: [
				'rsm:ExchangedDocumentContext',
				'ram:BusinessProcessSpecifiedDocumentContextParameter',
				'ram:ID',
			],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:CustomizationID'],
			dest: [
				'rsm:ExchangedDocumentContext',
				'ram:GuidelineSpecifiedDocumentContextParameter',
				'ram:ID',
			],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:ID'],
			dest: ['rsm:ExchangedDocument', 'ram:ID'],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:InvoiceTypeCode'],
			dest: ['rsm:ExchangedDocument', 'ram:TypeCode'],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			subtype: 'DateTimeString',
			src: ['cbc:IssueDate'],
			dest: [
				'rsm:ExchangedDocument',
				'ram:IssueDateTime',
				'udt:DateTimeString',
			],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:IssueDate', 'fixed:102'],
			dest: [
				'rsm:ExchangedDocument',
				'ram:IssueDateTime',
				'udt:DateTimeString@format',
			],
			fxProfile: FX_MINIMUM,
		},
		{
			type: 'string',
			src: ['cbc:Note'],
			dest: ['rsm:ExchangedDocument', 'ram:IncludedNote', 'ram:Content'],
			fxProfile: FX_BASIC_WL,
		},
		{
			type: 'object',
			src: [],
			dest: ['rsm:SupplyChainTradeTransaction'],
			children: [
				cacInvoiceLine,
				{
					type: 'string',
					src: ['cbc:BuyerReference'],
					dest: ['ram:ApplicableHeaderTradeAgreement', 'ram:BuyerReference'],
					fxProfile: FX_MINIMUM,
				},
				{
					type: 'object',
					src: ['cac:AccountingSupplierParty', 'cac:Party'],
					dest: ['ram:ApplicableHeaderTradeAgreement', 'ram:SellerTradeParty'],
					children: cacAccountingSupplierParty,
				},
				{
					type: 'object',
					src: ['cac:AccountingCustomerParty', 'cac:Party'],
					dest: ['ram:ApplicableHeaderTradeAgreement', 'ram:BuyerTradeParty'],
					children: cacAccountingCustomerParty,
				},
				{
					type: 'string',
					src: ['cac:OrderReference', 'cbc:SalesOrderID'],
					dest: [
						'ram:ApplicableHeaderTradeAgreement',
						'ram:SellerOrderReferencedDocument',
						'ram:IssuerAssignedID',
					],
					fxProfile: FX_EN16931,
				},
				{
					type: 'string',
					src: ['cac:OrderReference', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeAgreement',
						'ram:BuyerOrderReferencedDocument',
						'ram:IssuerAssignedID',
					],
					fxProfile: FX_EXTENDED,
				},
				{
					type: 'string',
					src: ['cac:ContractDocumentReference', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeAgreement',
						'ram:ContractReferencedDocument',
						'ram:IssuerAssignedID',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'object',
					src: ['cac:AdditionalDocumentReference'],
					dest: [
						'ram:ApplicableHeaderTradeAgreement',
						'ram:AdditionalReferencedDocument',
					],
					children: cacAdditionalDocumentReference,
				},
				{
					type: 'string',
					src: ['cac:ProjectReference', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeAgreement',
						'ram:SpecifiedProcuringProject',
						'ram:ID',
					],
					fxProfile: FX_EXTENDED,
				},
				// FIXME! This is an array for CII.
				{
					type: 'string',
					src: ['cac:Delivery', 'cac:DeliveryLocation', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeDelivery',
						'ram:ShipToTradeParty',
						'udt:ID',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: [
						'cac:Delivery',
						'cac:DeliveryParty',
						'cac:PartyName',
						'cbc:Name',
					],
					dest: [
						'ram:ApplicableHeaderTradeDelivery',
						'ram:ShipToTradeParty',
						'ram:Name',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'object',
					src: ['cac:Delivery', 'cac:DeliveryLocation', 'cac:Address'],
					dest: [
						'ram:ApplicableHeaderTradeDelivery',
						'ram:ShipToTradeParty',
						'ram:PostalTradeAddress',
					],
					children: deliveryAddress,
				},
				{
					type: 'string',
					src: ['cac:DespatchDocumentReference', 'cbc:ID'],
					dest: [
						'ram:DespatchAdviceReferencedDocument ',
						'ram:IssuerAssignedID',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cac:ReceiptDocumentReference', 'cbc:ID'],
					dest: [
						'ram:ReceivingAdviceReferencedDocument ',
						'ram:IssuerAssignedID',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cac:PayeeParty', 'cac:PartyIdentification', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:CreditorReferenceID',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cac:PaymentMeans', 'cbc:PaymentID'],
					dest: ['ram:ApplicableHeaderTradeSettlement', 'ram:PaymentReference'],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cbc:TaxCurrencyCode'],
					dest: ['ram:ApplicableHeaderTradeSettlement', 'ram:TaxCurrencyCode'],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cbc:DocumentCurrencyCode'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:InvoiceCurrencyCode',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'object',
					src: ['cac:PayeeParty'],
					dest: ['ram:ApplicableHeaderTradeSettlement', 'ram:PayeeTradeParty'],
					children: cacPayeeParty,
				},
				{
					type: 'array',
					src: ['cac:PaymentMeans'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:SpecifiedTradeSettlementPaymentMeans',
					],
					children: cacPaymentMeans,
				},
				{
					type: 'array',
					src: ['cac:TaxTotal'],
					dest: [],
					children: [
						{
							type: 'array',
							src: ['cac:TaxSubtotal'],
							dest: [
								'ram:ApplicableHeaderTradeSettlement',
								'ram:ApplicableTradeTax',
							],
							children: cacTaxSubtotal,
						},
					],
				},
				cacInvoicePeriod,
				cacAllowanceCharge,
				{
					type: 'string',
					src: ['cac:PaymentTerms', 'cbc:Note'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:SpecifiedTradePaymentTerms',
						'ram:Description',
					],
					fxProfile: FX_EN16931,
				},
				{
					type: 'string',
					subtype: 'DateTimeString',
					src: ['cbc:DueDate'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:SpecifiedTradePaymentTerms',
						'ram:DueDateDateTime',
						'udt:DateTimeString',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cbc:DueDate', 'fixed:102'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:SpecifiedTradePaymentTerms',
						'ram:DueDateDateTime',
						'udt:DateTimeString@format',
					],
					fxProfile: FX_BASIC_WL,
				},
				{
					type: 'string',
					src: ['cac:PaymentMeans', 'cac:PaymentMandate', 'cbc:ID'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:SpecifiedTradePaymentTerms',
						'ram:DirectDebitMandateID',
					],
					fxProfile: FX_BASIC_WL,
				},
				cacLegalMonetaryTotal,
				{
					type: 'array',
					src: ['cac:BillingReference'],
					dest: [
						'ram:ApplicableHeaderTradeSettlement',
						'ram:InvoiceReferencedDocument',
					],
					children: [
						{
							type: 'string',
							src: ['cbc:ID'],
							dest: ['ram:IssuerAssignedID'],
							fxProfile: FX_BASIC_WL,
						},
						{
							type: 'string',
							src: ['cbc:IssueDate'],
							dest: ['ram:FormattedIssueDateTime', 'udt:DateTimeString'],
							fxProfile: FX_BASIC_WL,
						},
						{
							type: 'string',
							src: ['cbc:IssueDate', 'fixed:102'],
							dest: ['ram:FormattedIssueDateTime', 'udt:DateTimeString@format'],
							fxProfile: FX_BASIC_WL,
						},
					],
				},
				{
					type: 'string',
					src: ['cbc:AccountingCost'],
					dest: ['ram:ReceivableSpecifiedTradeAccountingAccount', 'ram:ID'],
					fxProfile: FX_BASIC_WL,
				},
			],
		},
	],
};

@Injectable()
export class FormatCIIService
	extends FormatUBLService
	implements EInvoiceFormat
{
	get customizationID(): string {
		return 'urn:cen.eu:en16931:2017';
	}

	get profileID(): string {
		return 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
	}

	get syntax(): 'CII' {
		return 'CII';
	}

	generate(invoice: Invoice): string {
		// FIXME! Remove this!
		//invoice['ubl:Invoice']['cac:InvoicePeriod'] ??= {};
		//invoice['ubl:Invoice']['cac:InvoicePeriod']['cbc:DescriptionCode'] = '35';

		const cii: ObjectNode = {};

		this.convert(invoice, '$', cii, '$', [ublInvoice]);

		cii['rsm:CrossIndustryInvoice@xmlns:xsi'] =
			'http://www.w3.org/2001/XMLSchema-instance';
		cii['rsm:CrossIndustryInvoice@xsi:schemaLocation'] =
			'urn:un:unece:uncefact:data' +
			':standard:CrossIndustryInvoice:100' +
			' ../schema/D16B%20SCRDM%20(Subset)/uncoupled%20clm/CII/uncefact' +
			'/data/standard/CrossIndustryInvoice_100pD16B.xsd';
		cii['rsm:CrossIndustryInvoice@xmlns:qdt'] =
			'urn:un:unece:uncefact:data:standard:QualifiedDataType:100';
		cii['rsm:CrossIndustryInvoice@xmlns:udt'] =
			'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100';
		cii['rsm:CrossIndustryInvoice@xmlns:rsm'] =
			'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
		cii['rsm:CrossIndustryInvoice@xmlns:ram'] =
			'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100';

		return this.render(cii, {
			prettyPrint: true,
			indent: '\t',
		});
	}

	private convert(
		invoice: Invoice,
		srcPath: string,
		dest: ObjectNode,
		destPath: string,
		transformations: Transformation[],
	) {
		for (const transformation of transformations) {
			const lastSrcKey = transformation.src[transformation.src.length - 1];
			let src: any;
			let childSrcPath: string;
			// Avoid writing attribute values for non-existing nodes.
			if (
				transformation.src.length &&
				lastSrcKey.startsWith('fixed:') &&
				transformation.dest.length &&
				transformation.dest[transformation.dest.length - 1].includes('@')
			) {
				const parentPaths = [...transformation.dest];
				parentPaths[parentPaths.length - 1] = parentPaths[
					parentPaths.length - 1
				].replace(/@.+/, '');
				const parentPath = this.applySubPaths(destPath, parentPaths);
				const parents = jsonpath.JSONPath({ path: parentPath, json: dest });
				if (parents.length === 0) {
					continue;
				}
				src = lastSrcKey.substring(6);
				childSrcPath = srcPath;
			} else {
				childSrcPath = this.applySubPaths(srcPath, transformation.src);
				const srcs = jsonpath.JSONPath({ path: childSrcPath, json: invoice });
				if (srcs.length === 0) {
					continue;
				}
				src = srcs[0];
			}

			const childDestPath = this.applySubPaths(destPath, transformation.dest);

			switch (transformation.type) {
				case 'object':
					this.convert(
						invoice,
						childSrcPath,
						dest,
						childDestPath,
						transformation.children,
					);
					break;
				case 'array':
					for (let i = 0; i < src.length; ++i) {
						const arraySrcPath = `${childSrcPath}[${i}]`;
						const arrayDestPath = transformation.dest.length
							? `${childDestPath}[${i}]`
							: childDestPath;
						this.convert(
							invoice,
							arraySrcPath,
							dest,
							arrayDestPath,
							transformation.children,
						);
					}
					break;
				case 'string':
					this.vivifyDest(
						dest,
						childDestPath,
						this.renderValue(src, transformation),
					);

					break;
			}
		}
	}

	private applySubPaths(path: string, subPaths: string[]) {
		for (const subPath of subPaths) {
			if (subPath === '..') {
				path = path.replace(/[[.][^[.]+$/, '');
			} else if (subPath.startsWith('@')) {
				const match = path.match(/^(.*?)(\[[0-9]+\])$/);
				if (match) {
					const basePath = match[1]; // The part before the brackets
					const indexPart = match[2] || ''; // The brackets with the number, if they exist

					path = `${basePath}${subPath}${indexPart}`;
				} else {
					path += subPath;
				}
			} else {
				path += `.${subPath}`;
			}
		}

		return path;
	}

	private vivifyDest(dest: ObjectNode, path: string, value: string) {
		const indices = path.replace(/\[([0-9]+)\]/g, '.$1').split('.');

		if (indices[0] === '$') {
			indices.shift();
		}

		for (let i = 0; i < indices.length - 1; ++i) {
			const key = indices[i];
			const nextIndex = indices[i + 1];

			const isNextArrayIndex = nextIndex.match(/^[0-9]+$/);

			if (isNextArrayIndex) {
				dest[key] ??= [];
			} else {
				dest[key] ??= {};
			}

			dest = dest[key] as ObjectNode;
		}

		dest[indices[indices.length - 1]] = value;
	}

	private renderValue(value: string, transformation: Transformation): string {
		if (transformation.subtype === 'DateTimeString') {
			return value.replaceAll('-', '');
		} else {
			return value;
		}
	}
}