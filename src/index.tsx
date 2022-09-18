import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Stage, Layer, Star, Text, Rect, Line } from "react-konva";
import sample from "./debug.json";
import { useDropzone } from "react-dropzone";
import { groupBy, maxBy, times } from "lodash";
import { KonvaEventObject } from "konva/lib/Node";

function isBetween(value, x1, x2) {
  return (value <= x1 && value >= x2) || (value <= x2 && value >= x1);
}
export enum EntryType {
  RequestRead,
  RequestWrite,
  ReadGranted,
  WriteGranted,
  ReadReleased,
  WriteReleased,
  RequestRejected,
  DeadlockDetected,
  DeadlockResolved,
  Unlocked,
  Created
}

export interface Theme {
  background: string;
  lightLines: string;
  mainLines: string;
  borderWidth: number;
  border: string;
  fill: string;
  fillWarn: string;
  colors: { [key in EntryType]: string };
}

const defaultTheme: Theme = {
  background: "#494848",
  lightLines: "#444",
  fill: "white",
  fillWarn: "lightcoral",
  mainLines: "#666",
  borderWidth: 1,
  border: "black",
  colors: {
    [EntryType.RequestRead]: "lightseagreen",
    [EntryType.RequestWrite]: "lightcoral",
    [EntryType.ReadGranted]: "seagreen",
    [EntryType.WriteGranted]: "coral",
    [EntryType.ReadReleased]: "darkseagreen",
    [EntryType.WriteReleased]: "darkcoral",
    [EntryType.RequestRejected]: "orange",
    [EntryType.DeadlockDetected]: "darkred",
    [EntryType.DeadlockResolved]: "darkgreen",
    [EntryType.Unlocked]: "yellow",
    [EntryType.Created]: "white"
  }
};

export interface ProtocolEntry {
  time: number;
  lockerId: number;
  type: EntryType;
  extraInfo?: string;
}

const rowHeight = 30;

const App = () => {
  const [data, setData] = React.useState<Array<ProtocolEntry>>(sample);

  const maxRows = Math.floor(window.innerHeight / rowHeight);

  const lockerData = React.useMemo(() => {
    const transactions = {};
    let currentRow = 0;

    return Object.values(groupBy(data, "lockerId"))
      .filter((protocol) => protocol.length > 2)
      .map((protocol) => {
        let info = protocol[0]!.extraInfo;
        let row = currentRow;
        if (info.includes("eventId")) {
          const { eventId, eventType } = JSON.parse(info);
          info = `${eventId.split("-")[0]} ${eventType}`;
          if (transactions[eventId]) {
            row = transactions[eventId];
            info = "**";
          } else {
            transactions[eventId] = currentRow++;
          }
        } else {
          row = currentRow++;
        }
        if (currentRow >= maxRows) {
          currentRow = 0;
        }

        return {
          info,
          label: info,
          row,
          warn:
            protocol.filter(({ type }) => type === EntryType.DeadlockDetected)
              .length > 0,
          begin: protocol[0]!.time,
          end: protocol[protocol.length - 1]!.time,
          protocol
        };
      });
  }, [data, maxRows]);

  let totalHeight = rowHeight * maxRows;
  const firstEntry = lockerData[0];
  const lastEntry = lockerData[lockerData.length - 1];
  const recordingBegin = firstEntry ? firstEntry.begin : 0;
  const recordingEnd = lastEntry
    ? maxBy(lockerData, "end").end
    : window.innerWidth;
  const [X, setX] = useState(recordingBegin);
  const totalDuration = recordingEnd - recordingBegin;
  const [scaleX, setScaleX] = React.useState(window.innerWidth / totalDuration);

  const setXWithinBounds = useCallback(
    (x: number) => {
      setX(
        Math.min(
          Math.max(x, recordingBegin),
          recordingEnd - window.innerWidth / scaleX
        )
      );
    },
    [setX, recordingBegin, recordingEnd, scaleX]
  );

  const [Y, setY] = useState(0);
  function getX(time) {
    return scaleX * time;
  }

  const visibleLockers = React.useMemo(
    () =>
      lockerData
        .filter(
          ({ begin, end }) =>
            isBetween(begin, X, X + window.innerWidth / scaleX) ||
            isBetween(end, X, X + window.innerWidth / scaleX)
        )
        .slice(0, 1000),
    [X, lockerData, scaleX]
  );

  const onDrop = React.useCallback((acceptedFiles) => {
    console.log("accepted:", acceptedFiles);

    if (acceptedFiles[0].type === "application/json") {
      acceptedFiles[0].text().then((t) => {
        setData(JSON.parse(t));
      });
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    noClick: true,
    onDrop
  });

  const theme = defaultTheme;
  console.log({
    X,
    duration: totalDuration,
    scaleX,
    recordingBegin,
    recordingEnd
  });
  const lineInterval = scaleX < 0.1 ? 1000 : 100;
  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <Stage width={window.innerWidth} height={window.innerHeight}>
        <Layer
          onWheel={useCallback(
            (e: KonvaEventObject<WheelEvent>) => {
              const maxScale = window.innerWidth / totalDuration;
              const newScale = Math.max(
                scaleX * (e.evt.deltaY < 0 ? 1.3 : 0.7),
                maxScale
              );
              setScaleX(newScale);
              setXWithinBounds(
                X - (e.evt.clientX / newScale - e.evt.clientX / scaleX)
              );
            },
            [scaleX, X, totalDuration, setXWithinBounds]
          )}
          x={-X * scaleX}
          y={0}
          draggable
          onDragMove={(e) => {
            const newPos = e.target.position();
            // reset position to its old state
            // so drag is fully controlled by react
            e.target.position({ x: -X * scaleX, y: 0 });

            setXWithinBounds(-newPos.x / scaleX);
            setY(Math.max(-newPos.y, 0));
          }}
        >
          <Rect
            x={X * scaleX}
            y={0}
            fill={theme.background}
            width={window.innerWidth}
            height={window.innerHeight}
          />
          {times(totalDuration / lineInterval, (x) =>
            isBetween(
              getX(x * lineInterval),
              X * scaleX,
              X * scaleX + window.innerWidth / scaleX
            ) ? (
              <Line
                key={`line${x}`}
                x={getX(x * lineInterval)}
                y={0}
                points={[0, 0, 0, totalHeight]}
                stroke={
                  (x % 10) * lineInterval === 0
                    ? theme.mainLines
                    : theme.lightLines
                }
              />
            ) : null
          )}
          {visibleLockers.map(
            ({ protocol, row, info, begin, end, warn }, n) => {
              const x = getX(begin);
              const y = Number(row) * rowHeight;
              const width = getX(end) - x;
              return (
                <>
                  <Rect
                    onClick={() => console.log(protocol)}
                    y={y}
                    x={x}
                    width={width + theme.borderWidth * 2}
                    strokeWidth={theme.borderWidth}
                    height={rowHeight}
                    fill={warn ? theme.fillWarn : theme.fill}
                    stroke={theme.border}
                  />
                  {width >= 10 ? (
                    <>
                      {protocol.map((entry, n) => {
                        return (
                          <Rect
                            onMouseEnter={() => 1}
                            key={n}
                            height={rowHeight / 2}
                            width={2}
                            x={x + (getX(entry.time) - x) * 1}
                            y={y + rowHeight / 2}
                            fill={theme.colors[entry.type]}
                          />
                        );
                      })}

                      <Text
                        x={x + width + theme.borderWidth + 2}
                        y={y + 2}
                        text={`${info}`}
                        fill={"white"}
                      />
                    </>
                  ) : null}
                </>
              );
            }
          )}
        </Layer>
      </Stage>
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
