// UTILS
const normalizeSets = require("../shared/normalize-sets");

// Reference, RESPONSE
/*
 1 -> Brings all today's event be they live right now or not
 3 -> Requests open event submarkets, need to send a 2 beforehand sil: [7, 37, 26, 11, 45, 15, 10, 1, 56, 73]
 2 -> Brings all the requested sports data
 5 -> Brings all events that are live now
 7 -> Brings all sports
 11 -> Updates Events
 12 -> Updates the coefficients of the selected sport / event
 13 -> Brings initial data of the open even, requires an operation of 2 beforehand
 */
// MESSAGE
//<---->
// We use oddClassID (otei) to recognize oddClasses that in this case are the same things with submarkets,
// and we use oddGeneralID (soi) to identify the singular odds

const normalizeOddList = (oddList, template, disableTemplateObedience) => {
  // how do we handle clarification?
  let parsedOddList = oddList.map(
    ({
      oti: oddClassLiveID,
      otn: oddClassName,
      status: oddClassStatus,
      otei: oddClassID,
      sv: oddClassSpecifiedParams,
      svn: oddClassParams,
      oil: odds,
      soi: submarketIndex,
    }) => ({
      oddClassID,
      oddClassLiveID,
      oddClassName,
      oddClassStatus,
      oddClassParams: oddClassParams?.split("/") || null,
      oddClassSpecifiedParams: oddClassSpecifiedParams?.split("/") || null,
      oddList: normalizeOddValues(odds, oddClassParams),
      submarketIndex,
    })
  );
  // here we have access to all the submarkets, we'll need an ID to drive similarities
  // between the template submarkets and the submarkets here.
  // TEMPLATE IS NEEDED
  if (template) {
    // in this case, we'll need to follow the template,
    // we'll need to override the oddList array and push any submarkets that aren't present
    // template order must be parsed though ->
    template = template.sort(
      ({ submarketIndex: a }, { submarketIndex: b }) => a - b
    );
    const fullSubmarkets = template.reduce((acc, templateSubmarket, i) => {
      const { oddClassID: templateSubmarketID } = templateSubmarket;
      const found = acc.find(
        ({ oddClassID }) => oddClassID === templateSubmarketID
      );
      if (!found) {
        // this specified submarket doesn't exist, let's add it
        // -> templateSubmarket must be transformed to have place for the values
        const { oddClassID, oddDescriptions, params, submarketName } =
          templateSubmarket;
        // generating the right oddList
        const oddList = oddDescriptions.map(
          ({ name, oddGeneralID, submarketIndex }) => ({
            lineValue: null,
            oddGeneralID,
            oddID: 0,
            oddName: name,
            oddValue: 0,
            submarketIndex,
          })
        );
        const missingSubmarket = {
          oddClassID,
          oddClassLiveID: "",
          oddClassName: submarketName,
          oddClassParams: params,
          oddClassSpecifiedParams: [],
          oddClassStatus: 1,
          oddList,
        };
        if (!disableTemplateObedience) acc.splice(i, 0, missingSubmarket);
        // <---------------->
        // we don't have to check individual odds as they'll always exist, only submarkets can be missing,
        // if a submarket is present all fo its odds be it blocked or not, they'll exist
      }
      return acc;
    }, parsedOddList);
    return fullSubmarkets.sort(
      ({ submarketIndex: a }, { submarketIndex: b }) => a - b
    );
  }
  return parsedOddList;
};
const paramEnum = {
  line: "Goals",
  setNr: "Sets",
  goalNr: "Next",
  hcp: "Spread",
};
const allowedParams = ["line", "setNr", "goalNr", "hcp"];
const allowedParamsClassIDs = [10096, 10175, 10496, 10097];
const buildClarification = (parsedOddList, template) => {
  const clarification = {};
  let clonedParsedOdds = [...parsedOddList];
  const reference = [];
  clonedParsedOdds = clonedParsedOdds.filter((oddItem, j) => {
    let { oddClassParams, oddClassSpecifiedParams, oddClassID } = oddItem;
    if (oddClassParams === null) {
      // we'll just do a check here if the id is within a certain range to overwrite the oddClassParams
      const index = allowedParamsClassIDs.indexOf(oddClassID);
      if (index !== -1) {
        oddClassParams = [allowedParams[index]];
      }
    }

    if (oddClassParams) {
      return !oddClassParams.some((param, i) => {
        if (allowedParams.includes(param)) {
          if (clarification[param]) {
            clarification[param].submarkets.push({
              value: oddClassSpecifiedParams[i],
              ...oddItem,
            });
            return true;
          } else {
            const descriptions = template
              ? template.find(
                  ({ oddClassID }) => oddClassID === oddItem.oddClassID
                )?.oddDescriptions
              : undefined;
            clarification[param] = {
              submarkets: [
                {
                  value: oddClassSpecifiedParams[i],
                  ...oddItem,
                },
              ],
              value: oddClassSpecifiedParams[i],
              submarketName: paramEnum[param],
              descriptions: descriptions,
            };
            reference.push({
              param,
              ref: oddItem.oddClassID,
            });
          }
        }
        return false;
      });
    }
    return true;
  });
  // now we lets find the duplicated submarket between
  reference.forEach(({ param, ref }) => {
    const targetIndex = clonedParsedOdds.findIndex(
      ({ oddClassID }) => oddClassID === ref
    );
    clonedParsedOdds[targetIndex] = {
      ...clonedParsedOdds[targetIndex],
      clarificationRef: param,
    };
  });

  return { clarification, submarkets: clonedParsedOdds };
};

const normalizeOddValues = (oddValues) => {
  // Map the oddValues to a new array with the desired properties
  let mappedOddValues = oddValues.map(
    ({
      oi: oddID,
      on: oddName,
      ov: oddValue,
      soi: oddGeneralID,
      ha: lineValue,
    }) => ({
      oddID,
      oddValue,
      oddName,
      oddGeneralID,
      lineValue,
    })
  );

  // Find the minimum lineValue in the mappedOddValues
  let minLineValue = Math.min(...mappedOddValues.map((obj) => obj.lineValue));

  // Filter out objects whose lineValue isn't the minimum
  return mappedOddValues.filter(({ lineValue }) => lineValue === minLineValue);
};
// sub-handlers
const handleEventConstruct = (
  response,
  operationID,
  template = undefined,
  disableTemplateObedience
) => {
  const { info, operationMessage } = response;
  if (operationMessage === "success") {
    const data = JSON.parse(info);
    return data
      .map((event) => {
        let eventData = {
          status: event["bs"],
          statusID: event["bst"],
          leagueID: event["cgi"],
          leagueName: event["cgn"],
          categoryID: event["ci"],
          categoryName: event["cn"],
          eventID: event["mid"],
          eventName: event["mn"],
          currentPartScore: event["ms"],
          overviewScore: event["mss"],
          time: event["mt"],
          sportName: event["snt"],
          sportID: event["si"],
          genderedSportName: event["sn"],
          currentPartName: event["st"],
          sportIndex: event["soi"],
        };
        const normalizedOddList = normalizeOddList(
          event["odtl"] ?? [],
          template,
          disableTemplateObedience
        );
        eventData = {
          ...eventData,
          ...buildClarification(normalizedOddList, template),
        };
        return eventData;
      })
      .sort(({ sportIndex: a }, { sportIndex: b }) => a - b);
  } else
    return `Provider Socket has faced an error, error found at operation ${operationID}(Events Construct)`;
};
const responseHandlerEnum = {
  7: (response) => {
    const regEx = /\[.*?]/g;
    const construct = {};
    const { defodds, operationMessage } = response;
    if (operationMessage === "success") {
      const submarkets = Array.isArray(defodds)
        ? defodds
        : Object.values(defodds);
      submarkets.forEach((submarkets) => {
        if (submarkets !== undefined) {
          submarkets = Array.isArray(submarkets) ? submarkets : [submarkets];
          //let's sort the submarkets here such that they're ready in the construct
          submarkets = submarkets.sort(({ soi: a }, { soi: b }) => a - b);
          submarkets?.forEach(
            (
              {
                oddsList,
                odtn: submarketName,
                sn: sportName,
                si: genderedSportID,
                spv: nameParams,
                snext: genderedSportName,
                otei: oddClassID,
                soi: submarketIndex,
              },
              i
            ) => {
              // handling cases where odds should have a clarification, we'll call it line from now on
              const odds = oddsList.map(({ name, sort }) => ({
                name,
                oddGeneralID: sort,
              }));
              // nameParams must be in this if, for future reference
              // if (nameParams) {
              //   if (
              //     nameParams?.includes("line") ||
              //     nameParams.includes("hcp")
              //   ) {
              //     // we check if it is an even or an odd
              //     if (oddsList.length % 2 === 0) {
              //       const indexOdOddToBeAdded = oddsList.length / 2;
              //       odds.splice(indexOdOddToBeAdded, 0, {
              //         name: "Goals",
              //         oddGeneralID: oddClassID + "-line",
              //       });
              //     } else {
              //       odds.splice(0, 0, {
              //         name: "Spread",
              //         oddGeneralID: oddClassID + "-line",
              //       });
              //     }
              //   }
              //   sportName = sportName.replace(regEx, "").trim();
              //   submarketName = submarketName.replace(regEx, "").trim();
              // }
              const fullData = {
                oddDescriptions: odds,
                params: nameParams?.split("/"),
                submarketIndex,
                sportName,
                submarketName,
                oddClassID,
              };
              if (construct[sportName]) {
                construct[sportName].genderedSportIDs.add(genderedSportID);
                construct[sportName].genderedSportNames.add(genderedSportName);

                if (!construct[sportName].submarkets[submarketName]) {
                  construct[sportName].submarkets[submarketName] = fullData;
                } else {
                  if (
                    !construct[sportName].submarkets[submarketName].oddClassID
                  ) {
                    construct[sportName].submarkets[submarketName].oddClassID =
                      oddClassID;
                  }
                }
              } else {
                construct[sportName] = {};
                construct[sportName].genderedSportIDs = new Set([
                  genderedSportID,
                ]);
                construct[sportName].genderedSportNames = new Set([
                  genderedSportName,
                ]);
                if (!construct[sportName].submarkets) {
                  construct[sportName].submarkets = {};
                }
                construct[sportName].submarkets[submarketName] = fullData;
                construct[sportName].submarkets[submarketName].oddClassID =
                  oddClassID;
              }
            }
          );
        }
      });
      return normalizeSets(construct);
    } else
      return "Provider Socket has faced an error, error found at operation 7(Sport Construct)";
  },
  11: (response, template) => handleEventConstruct(response, 11, template),
  1: (response) => handleEventConstruct(response, 1),
  12: (response, template, disableTemplateObedience) =>
    handleEventConstruct(response, 12, template, disableTemplateObedience),
  2: (response) => {
    // figuring out the number of markets and the number of odds inside them
    // such that we send the right number of coefficients to the front-end
    // and fill the empty ones with 0s
    const sport = Object.values(responseHandlerEnum[7](response));
    // -> the requested sport
    const requestedSportGenderedIDs = sport[0].genderedSportIDs;
    // -> requiredSubmarkets, all the submarkets required within each event
    const requiredSubmarkets = Object.values(sport[0].submarkets);
    const events = handleEventConstruct(response, 2, requiredSubmarkets);
    // building the construct, the events MUST be parsed following the template by now
    const construct = {};
    events.forEach((event) => {
      // need a handle for when it is specified categoryName = null
      const { categoryID, categoryName, leagueName, leagueID } = event;
      if (construct[categoryID]) {
        // the category exists
        if (construct[categoryID].leagues[leagueID]) {
          // the league exists, let's add the match
          construct[categoryID].leagues[leagueID].events.push(event);
        } else {
          construct[categoryID].leagues[leagueID] = {
            leagueID,
            leagueName,
            events: [event],
          };
        }
      } else {
        // initializing the category
        construct[categoryID] = {
          categoryName,
          categoryID,
          leagues: {},
        };
        // initializing the league
        construct[categoryID].leagues[leagueID] = {
          leagueID,
          leagueName, // initializing the events array
          events: [event],
        };
      }
    });
    return {
      build: Object.values(construct).map(({ leagues, ...rest }) => {
        return { leagues: Object.values(leagues), ...rest };
      }),
      template: requiredSubmarkets,
      requestedSportGenderedIDs,
    };
  },
  firstConstruct: (sportsConstruct, eventsConstruct) => {
    const construct = eventsConstruct.reduce(
      (accumulator, { sportName, categoryName, categoryID }) => {
        // handling the sport generation
        if (!accumulator[sportName]) {
          accumulator[sportName] = {
            ...sportsConstruct[sportName],
            sportName,
            numberOfEvents: 1,
            categories: {},
          };
        } else {
          accumulator[sportName].numberOfEvents += 1;
        }

        // handling the category generation
        const targetCategory = accumulator[sportName].categories[categoryName];
        accumulator[sportName].categories[categoryName] =
          targetCategory !== undefined
            ? {
                ...targetCategory,
                numberOfEvents: targetCategory.numberOfEvents + 1,
              }
            : {
                categoryID,
                categoryName,
                numberOfEvents: 1,
              };
        return accumulator;
      },
      {}
    );
    return Object.values(construct)
      .sort((a, b) => a.sportIndex - b.sportIndex)
      .map(({ submarkets, categories, ...rest }) => {
        return {
          submarkets:
            submarkets !== undefined ? Object.values(submarkets) : null,
          categories:
            categories !== undefined ? Object.values(categories) : null,
          ...rest,
        };
      });
  },
};
module.exports = responseHandlerEnum;
