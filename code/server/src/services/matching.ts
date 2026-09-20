import mongoose from 'mongoose';
import {
  Request as RequestModel,
  RequestResource,
  ResourceInventory,
  RequestAssignment,
  User,
  Organization,
  IUser,
} from '../models';

export interface MatchFactorDetail {
  score: number; // 0.0 to 1.0
  weight: number;
  weightedScore: number;
  explanation: string;
  metric?: string | number;
}

export interface CandidateMatch {
  candidateId: string;
  candidateType: 'user' | 'organization';
  name: string;
  role: string;
  organizationName?: string;
  organizationId?: string;
  overallScore: number; // 0.0 to 1.0
  distanceKm?: number;
  factors: {
    proximity: MatchFactorDetail;
    suitability: MatchFactorDetail;
    capacity: MatchFactorDetail;
    availability: MatchFactorDetail;
  };
  summary: string;
}

export interface MatchingResult {
  requestId: string;
  requestCategory: string;
  emergencyLocation: {
    lat: number;
    lng: number;
  };
  totalCandidatesEvaluated: number;
  matches: CandidateMatch[];
}

/**
 * Calculates Haversine distance in kilometers between two lat/lng points.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
}

/**
 * Weights for the multi-factor normalized scoring formula.
 * Total weights sum to 1.0.
 */
export const MATCH_WEIGHTS = {
  proximity: 0.35,
  suitability: 0.3,
  capacity: 0.2,
  availability: 0.15,
};

/**
 * Evaluates candidates and returns a ranked list of suggestions for a verified request.
 */
export async function calculateMatchesForRequest(
  requestIdOrMongoId: string
): Promise<MatchingResult | null> {
  // 1. Fetch Request
  let requestDoc = await RequestModel.findOne({ requestId: requestIdOrMongoId });
  if (!requestDoc && mongoose.isValidObjectId(requestIdOrMongoId)) {
    requestDoc = await RequestModel.findById(requestIdOrMongoId);
  }

  if (!requestDoc) {
    return null;
  }

  const reqLat = requestDoc.location.preciseLat;
  const reqLng = requestDoc.location.preciseLng;
  const reqCategory = requestDoc.category;

  // 2. Fetch required resources for this request
  const requestResources = await RequestResource.find({
    request: requestDoc._id,
  }).populate('resource');

  const requiredResourceIds = requestResources.map((rr) => rr.resource?._id?.toString()).filter(Boolean);

  // 3. Discover candidates (volunteers, NGOs, resource providers)
  // Exclude affected citizens, central admins, and the request creator
  const candidateFilter: Record<string, any> = {
    role: { $in: ['volunteer', 'ngo', 'resource_provider'] },
  };
  if (requestDoc.createdBy) {
    candidateFilter._id = { $ne: requestDoc.createdBy };
  }

  const candidateUsers = await User.find(candidateFilter).populate('organizationId');

  const matches: CandidateMatch[] = [];

  for (const candidate of candidateUsers) {
    const orgDoc = candidate.organizationId as any;
    const orgName = orgDoc?.name;
    const orgId = orgDoc?._id?.toString();

    // --- Factor 1: Proximity (Weight = 0.35) ---
    let distanceKm: number | undefined = undefined;
    let proximityScore = 0.5; // neutral baseline
    let proximityExplanation = 'Location not declared (neutral baseline)';

    // Check candidate's direct location
    let candLat = candidate.location?.lat;
    let candLng = candidate.location?.lng;

    // If candidate has no direct location, check their inventory depot
    if (candLat === undefined || candLng === undefined) {
      const inventoryWithLoc = await ResourceInventory.findOne({
        $or: [
          { ownerId: candidate._id },
          ...(orgId ? [{ organization: orgDoc._id }] : []),
        ],
        'location.lat': { $exists: true, $ne: null },
      });

      if (inventoryWithLoc?.location?.lat !== undefined && inventoryWithLoc?.location?.lng !== undefined) {
        candLat = inventoryWithLoc.location.lat;
        candLng = inventoryWithLoc.location.lng;
      }
    }

    if (candLat !== undefined && candLng !== undefined) {
      distanceKm = calculateHaversineDistanceKm(reqLat, reqLng, candLat, candLng);
      if (distanceKm <= 1.0) {
        proximityScore = 1.0;
        proximityExplanation = `${distanceKm}km away (immediate proximity)`;
      } else if (distanceKm <= 25.0) {
        proximityScore = Number(Math.max(0.1, 1 - (distanceKm - 1) / 24).toFixed(3));
        proximityExplanation = `${distanceKm}km away`;
      } else {
        proximityScore = Number(Math.max(0.05, 1 - distanceKm / 50).toFixed(3));
        proximityExplanation = `${distanceKm}km away (extended radius)`;
      }
    }

    // --- Factor 2: Suitability (Weight = 0.30) ---
    let suitabilityScore = 0.5;
    let suitabilityExplanation = 'General responder';

    // Find candidate's or organization's registered inventories
    const candidateInventories = await ResourceInventory.find({
      $or: [
        { ownerId: candidate._id },
        ...(orgId ? [{ organization: orgDoc._id }] : []),
      ],
    }).populate('resource');

    if (requestResources.length > 0) {
      // Request specifically demands resources
      const matchingInventories = candidateInventories.filter((inv) => {
        const invResId = (inv.resource as any)?._id?.toString();
        return invResId && requiredResourceIds.includes(invResId);
      });

      if (matchingInventories.length > 0) {
        const ratio = matchingInventories.length / requestResources.length;
        suitabilityScore = Number(Math.min(1.0, 0.4 + 0.6 * ratio).toFixed(3));
        suitabilityExplanation = `Holds ${matchingInventories.length} of ${requestResources.length} required resource type(s)`;
      } else if (candidate.role === 'volunteer' || candidate.role === 'ngo') {
        suitabilityScore = 0.35;
        suitabilityExplanation = 'Personnel available for logistics / delivery';
      } else {
        suitabilityScore = 0.1;
        suitabilityExplanation = 'No matching stock for requested resources';
      }
    } else {
      // General emergency request without specific supply demands
      const skills = candidate.skills || [];
      if (skills.some((s) => s.toLowerCase() === reqCategory.toLowerCase())) {
        suitabilityScore = 1.0;
        suitabilityExplanation = `Certified skill match for ${reqCategory}`;
      } else if (candidate.role === 'ngo') {
        suitabilityScore = 0.85;
        suitabilityExplanation = `NGO institutional response capability for ${reqCategory}`;
      } else if (candidate.role === 'volunteer') {
        suitabilityScore = 0.75;
        suitabilityExplanation = `Field responder capability for ${reqCategory}`;
      } else {
        suitabilityScore = 0.4;
        suitabilityExplanation = 'Supply depot provider';
      }
    }

    // --- Factor 3: Capacity (Weight = 0.20) ---
    let capacityScore = 0.8;
    let capacityExplanation = 'Available capacity';

    if (requestResources.length > 0 && candidateInventories.length > 0) {
      let totalAvailable = 0;
      let totalNeeded = 0;

      for (const rr of requestResources) {
        const needed = Math.max(0, rr.quantityRequested - rr.quantityAllocated);
        totalNeeded += needed;

        const matchingInv = candidateInventories.find(
          (inv) => (inv.resource as any)?._id?.toString() === (rr.resource as any)?._id?.toString()
        );
        if (matchingInv) {
          totalAvailable += Math.max(0, matchingInv.quantityAvailable - matchingInv.quantityReserved);
        }
      }

      if (totalNeeded > 0) {
        const fillRatio = Math.min(1.0, totalAvailable / totalNeeded);
        capacityScore = Number((0.2 + 0.8 * fillRatio).toFixed(3));
        capacityExplanation = `${totalAvailable} unit(s) unreserved in stock (${Math.round(fillRatio * 100)}% coverage)`;
      } else {
        capacityScore = 1.0;
        capacityExplanation = 'Full resource capacity available';
      }
    } else {
      // Evaluate responder active assignment load
      const activeAssignments = await RequestAssignment.countDocuments({
        assignedTo: candidate._id,
        status: { $in: ['assigned', 'accepted', 'en_route', 'on_scene'] },
      });

      if (activeAssignments === 0) {
        capacityScore = 1.0;
        capacityExplanation = 'Full capacity (0 active field assignments)';
      } else if (activeAssignments === 1) {
        capacityScore = 0.65;
        capacityExplanation = 'Moderate capacity (1 active assignment in progress)';
      } else {
        capacityScore = 0.2;
        capacityExplanation = `High load (${activeAssignments} active assignments in progress)`;
      }
    }

    // --- Factor 4: Availability (Weight = 0.15) ---
    let availabilityScore = 0.5; // neutral baseline for undeclared schedule
    let availabilityExplanation = 'No schedule declared (neutral baseline)';

    if (candidate.availability) {
      const { status, startHour, endHour } = candidate.availability;
      if (status === 'busy') {
        availabilityScore = 0.2;
        availabilityExplanation = 'Declared status: Busy';
      } else if (status === 'offline') {
        availabilityScore = 0.05;
        availabilityExplanation = 'Declared status: Offline';
      } else if (startHour !== undefined && endHour !== undefined) {
        const currentHour = new Date().getHours();
        const isInWindow =
          startHour <= endHour
            ? currentHour >= startHour && currentHour < endHour
            : currentHour >= startHour || currentHour < endHour;

        if (isInWindow) {
          availabilityScore = 1.0;
          availabilityExplanation = `Within declared duty window (${startHour}:00 - ${endHour}:00)`;
        } else {
          availabilityScore = 0.25;
          availabilityExplanation = `Outside declared duty window (${startHour}:00 - ${endHour}:00)`;
        }
      } else if (status === 'available') {
        availabilityScore = 1.0;
        availabilityExplanation = 'Declared status: Available on-call';
      }
    }

    // --- Overall Weighted Score Calculation ---
    const weightedProximity = Number((proximityScore * MATCH_WEIGHTS.proximity).toFixed(4));
    const weightedSuitability = Number((suitabilityScore * MATCH_WEIGHTS.suitability).toFixed(4));
    const weightedCapacity = Number((capacityScore * MATCH_WEIGHTS.capacity).toFixed(4));
    const weightedAvailability = Number((availabilityScore * MATCH_WEIGHTS.availability).toFixed(4));

    const overallScore = Number(
      (weightedProximity + weightedSuitability + weightedCapacity + weightedAvailability).toFixed(2)
    );

    // Summary readout string
    const distText = distanceKm !== undefined ? `${distanceKm}km away` : 'location undeclared';
    const summary = `Score: ${overallScore.toFixed(2)} — ${distText}, ${suitabilityExplanation.toLowerCase()}, ${availabilityExplanation.toLowerCase()}`;

    matches.push({
      candidateId: candidate._id.toString(),
      candidateType: 'user',
      name: candidate.name,
      role: candidate.role,
      organizationName: orgName,
      organizationId: orgId,
      overallScore,
      distanceKm,
      factors: {
        proximity: {
          score: proximityScore,
          weight: MATCH_WEIGHTS.proximity,
          weightedScore: weightedProximity,
          explanation: proximityExplanation,
          metric: distanceKm !== undefined ? `${distanceKm} km` : undefined,
        },
        suitability: {
          score: suitabilityScore,
          weight: MATCH_WEIGHTS.suitability,
          weightedScore: weightedSuitability,
          explanation: suitabilityExplanation,
        },
        capacity: {
          score: capacityScore,
          weight: MATCH_WEIGHTS.capacity,
          weightedScore: weightedCapacity,
          explanation: capacityExplanation,
        },
        availability: {
          score: availabilityScore,
          weight: MATCH_WEIGHTS.availability,
          weightedScore: weightedAvailability,
          explanation: availabilityExplanation,
        },
      },
      summary,
    });
  }

  // Rank matches descending by overall score
  matches.sort((a, b) => b.overallScore - a.overallScore);

  return {
    requestId: requestDoc.requestId,
    requestCategory: requestDoc.category,
    emergencyLocation: {
      lat: reqLat,
      lng: reqLng,
    },
    totalCandidatesEvaluated: candidateUsers.length,
    matches,
  };
}
